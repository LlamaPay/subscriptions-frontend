import { type Address, erc20Abi } from "viem";
import { multicall, readContract } from "wagmi/actions";

import { SUBSCRIPTIONS_ABI } from "~/lib/abi.subscriptions";
import { SUBSCRIPTION_DURATION } from "~/lib/constants";
import { fetchLegacySubs } from "~/lib/legacySubs";
import { type TChain, config, llamapayChainNamesToIds } from "~/lib/wallet";
import type { IFormattedSub, INewSub, ISub } from "~/types";

import { formatNewSubs, formatSubs } from "./utils";

function subStatus(data: ISub) {
	if (data.startTimestamp === data.realExpiration) {
		return -1;
	}
	if (+data.startTimestamp > Date.now() / 1e3) {
		return 0;
	}
	return +data.realExpiration < Date.now() / 1e3 ? -1 : 1;
}

export async function getSubscriptions(address: Address) {
	const [legacySubs, newSubsResult] = await Promise.allSettled([
		fetchLegacySubs(
			`{ or: [{ owner: "${address.toLowerCase()}" }, { receiver: "${address.toLowerCase()}" }] }`,
		),
		fetch(`https://api.llamapay.io/subscriptions/owned/${address}`).then(
			(res) => res.json() as Promise<{ subscriptions: Array<INewSub> }>,
		),
	]);

	if (newSubsResult.status === "rejected") {
		throw newSubsResult.reason;
	}

	// The API can list chains this app has no RPC for; those subscriptions are left out.
	const newSubs: Array<INewSub & { chainId: TChain }> = [];
	for (const sub of newSubsResult.value.subscriptions) {
		const chainId = llamapayChainNamesToIds[sub.chain];
		if (chainId !== undefined) {
			newSubs.push({ ...sub, chainId });
		}
	}

	const subsContracts = new Map<string, { address: Address; chainId: TChain }>();
	for (const sub of newSubs) {
		subsContracts.set(`${sub.subs_contract}:${sub.chainId}`, {
			address: sub.subs_contract,
			chainId: sub.chainId,
		});
	}

	const tokenAddresses = await readEach(subsContracts, ({ address: contract, chainId }) =>
		readContract(config, {
			address: contract,
			abi: SUBSCRIPTIONS_ABI,
			functionName: "asset",
			chainId,
		}),
	);

	const tokens = new Map<string, { address: Address; chainId: TChain }>();
	for (const [key, { chainId }] of subsContracts) {
		const token = tokenAddresses.get(key);
		if (token) {
			tokens.set(`${token}:${chainId}`, { address: token, chainId });
		}
	}

	const tokenDecimals = await readEach(tokens, ({ address: token, chainId }) =>
		readContract(config, { address: token, abi: erc20Abi, functionName: "decimals", chainId }),
	);

	return [
		...formatNewSubs({ subs: newSubs, tokenAddresses, tokenDecimals }),
		...formatSubs(legacySubs.status === "fulfilled" ? legacySubs.value : []),
	].toSorted((a, b) => subStatus(b) - subStatus(a));
}

// A read that fails leaves null for its key, so one broken contract hides only its own subscriptions.
async function readEach<T, R>(items: Map<string, T>, read: (item: T) => Promise<R>) {
	const keys = [...items.keys()];
	const results = await Promise.allSettled([...items.values()].map(read));

	return new Map(
		keys.map((key, i) => {
			const result = results[i];
			return [key, result.status === "fulfilled" ? result.value : null] as const;
		}),
	);
}

// Subs.sol rounds the shares a subscription has paid up (solmate's mulDivUp), so rounding
// down here would overstate what unsubscribe returns.
function mulDivUp(x: bigint, y: bigint, denominator: bigint) {
	return (x * y + denominator - 1n) / denominator;
}

// What unsubscribe would return now, following Subs.sol's unsubscribe.
export async function calculateSubBalance(sub: IFormattedSub, tokenDivisor: bigint) {
	const contract = { address: sub.subsContract, abi: SUBSCRIPTIONS_ABI, chainId: sub.chainId };

	const initialShares = BigInt(sub.initialShares);

	const currentTimestamp = BigInt(Math.floor(Date.now() / 1e3));

	if (BigInt(sub.expirationDate) >= currentTimestamp) {
		const [accumulated, currentPeriod] = await Promise.all([
			readContract(config, { ...contract, functionName: "sharesAccumulator" }),
			readContract(config, { ...contract, functionName: "currentPeriod" }),
		]);

		let sharesAccumulator = accumulated;

		if (currentPeriod + BigInt(SUBSCRIPTION_DURATION) < currentTimestamp) {
			const shares = await readContract(config, {
				...contract,
				functionName: "convertToShares",
				args: [tokenDivisor],
			});
			sharesAccumulator +=
				((currentTimestamp - currentPeriod) / BigInt(SUBSCRIPTION_DURATION)) * shares;
		}

		const sharesPaid = mulDivUp(
			sharesAccumulator - BigInt(sub.accumulator),
			BigInt(sub.amountPerCycle),
			tokenDivisor,
		);

		return readContract(config, {
			...contract,
			functionName: "convertToAssets",
			args: [initialShares - sharesPaid],
		});
	}

	const periods: Array<bigint> = [];

	for (
		let period = BigInt(sub.initialPeriod);
		period < BigInt(sub.expirationDate);
		period += BigInt(SUBSCRIPTION_DURATION)
	) {
		periods.push(period);
	}

	const [currentSharePrice, periodShares] = await Promise.all([
		readContract(config, { ...contract, functionName: "convertToShares", args: [tokenDivisor] }),
		multicall(config, {
			chainId: sub.chainId,
			contracts: periods.map((period) => ({
				address: sub.subsContract,
				abi: SUBSCRIPTIONS_ABI,
				functionName: "sharesPerPeriod" as const,
				args: [period],
			})),
		}),
	]);

	let subsetAccumulator = 0n;

	// A period with no recorded share price is charged at the current price.
	for (const { result: shares } of periodShares) {
		subsetAccumulator += shares === undefined || shares === 0n ? currentSharePrice : shares;
	}

	return readContract(config, {
		...contract,
		functionName: "convertToAssets",
		args: [initialShares - mulDivUp(subsetAccumulator, BigInt(sub.amountPerCycle), tokenDivisor)],
	});
}
