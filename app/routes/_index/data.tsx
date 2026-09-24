import { gql, request } from "graphql-request";

import type { INewSub, ISub } from "~/types";

import { readContract } from "wagmi/actions";
import { LLAMAPAY_CHAINS_LIB } from "~/lib/constants";
import { config, llamapayChainNamesToIds } from "~/lib/wallet";
import { formatNewSubs, formatSubs } from "./utils";

const subStatus = (data: ISub) => {
	return data.startTimestamp === data.realExpiration
		? -1
		: +data.startTimestamp > Date.now() / 1e3
			? 0
			: +data.realExpiration < Date.now() / 1e3
				? -1
				: 1;
};

export async function getSubscriptions(address?: string) {
	try {
		if (!address) return null;

		const subs = gql`
			{
				subs(
					where: {
						or: [
							{ owner: "${address.toLowerCase()}" },
							{ receiver: "${address.toLowerCase()}" }
						]
					}
					orderBy: realExpiration
					orderDirection: desc
				) {
					id
					owner
					receiver
					startTimestamp
					unsubscribed
					initialShares
					initialPeriod
					expirationDate
					amountPerCycle
					realExpiration
					accumulator
					creationTx
					subsContract
				}
			}
		`;
		const [legacySubs, newSubsResult] = await Promise.allSettled([
			request(
				LLAMAPAY_CHAINS_LIB[10].subgraphs.subscriptions,
				subs,
			) as Promise<{
				subs: Array<ISub>;
			}>,
			fetch(`https://api.llamapay.io/subscriptions/owned/${address}`).then(
				(res) => res.json() as Promise<{ subscriptions: Array<INewSub> }>,
			),
		]);

		if (newSubsResult.status === "rejected") {
			throw newSubsResult.reason;
		}

		const data =
			legacySubs.status === "fulfilled" ? legacySubs.value : { subs: [] };
		const newSubs = newSubsResult.value;

		const uniqueSubsContracts = new Set<string>();

		for (const sub of newSubs.subscriptions) {
			uniqueSubsContracts.add(
				`${sub.subs_contract}:${llamapayChainNamesToIds[sub.chain]}`,
			);
		}

		const tokenAddresses = await getTokenAddresses(
			Array.from(uniqueSubsContracts),
		);

		const uniqueTokens = Object.entries(tokenAddresses).map(
			([sub, token]) => `${token}:${sub.split(":")[1]}`,
		);

		const tokenDecimals = await getTokenDecimals(uniqueTokens);

		return [
			...formatNewSubs({
				subs: newSubs.subscriptions,
				tokenAddresses,
				tokenDecimals,
			}),
			...formatSubs(data?.subs ?? []),
		].sort((a, b) => subStatus(b) - subStatus(a));
	} catch (error: any) {
		throw new Error(error.message ?? "Failed to fetch subscriptions");
	}
}

const getTokenAddresses = async (contracts: Array<string>) => {
	try {
		const data = await Promise.allSettled(
			contracts.map((contract) =>
				readContract(config, {
					address: contract.split(":")[0] as `0x${string}`,
					abi: [
						{
							inputs: [],
							name: "asset",
							outputs: [
								{ internalType: "contract ERC20", name: "", type: "address" },
							],
							stateMutability: "view",
							type: "function",
						},
					],
					functionName: "asset",
					chainId: +contract.split(":")[1] as any,
				}),
			),
		);

		return Object.fromEntries(
			contracts.map((contract, i) => [
				contract,
				data[i].status === "fulfilled" ? (data[i].value as string) : null,
			]),
		);
	} catch (error) {
		console.log(error);
		return {};
	}
};

const getTokenDecimals = async (contracts: Array<string>) => {
	try {
		const data = await Promise.allSettled(
			contracts.map((contract) =>
				readContract(config, {
					address: contract.split(":")[0] as `0x${string}`,
					abi: [
						{
							inputs: [],
							name: "decimals",
							outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
							stateMutability: "view",
							type: "function",
						},
					],
					functionName: "decimals",
					chainId: +contract.split(":")[1] as any,
				}),
			),
		);

		return Object.fromEntries(
			contracts.map((contract, i) => [
				contract,
				data[i].status === "fulfilled" ? (data[i].value as number) : null,
			]),
		);
	} catch (error) {
		console.log(error);
		return {};
	}
};
