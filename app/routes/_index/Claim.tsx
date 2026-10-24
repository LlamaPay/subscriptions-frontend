import { skipToken, useQueries, useQuery } from "@tanstack/react-query";
import { type Address, type Chain, formatUnits } from "viem";
import { useConnection, useSwitchChain } from "wagmi";
import { multicall, readContract } from "wagmi/actions";

import { useHydrated } from "~/hooks/useHydrated";
import { SUBSCRIPTIONS_ABI } from "~/lib/abi.subscriptions";
import { type ITokenByChain, SUBSCRIPTION_DURATION, tokensByChain } from "~/lib/constants";
import { type TChain, chainIdToNames, config } from "~/lib/wallet";
import { formatNum } from "~/utils/formatNum";

import { useClaim } from "./actions";

async function calculateAvailableToClaim({
	token,
	receiver,
	chainId,
}: {
	token: ITokenByChain;
	receiver: Address;
	chainId: TChain;
}) {
	const contract = { address: token.subsContract, abi: SUBSCRIPTIONS_ABI, chainId };

	const currentTimestamp = BigInt(Math.floor(Date.now() / 1e3));

	const [storedBalance, storedAmountPerPeriod, lastUpdate] = await readContract(config, {
		...contract,
		functionName: "receiverBalances",
		args: [receiver],
	});

	let balance = storedBalance;
	let amountPerPeriod = storedAmountPerPeriod;

	const periodBoundary = currentTimestamp - BigInt(SUBSCRIPTION_DURATION);

	// Periods since the last update are not in the stored balance yet.
	if (lastUpdate <= periodBoundary && lastUpdate !== 0n) {
		const periods: Array<bigint> = [];
		for (
			let period = lastUpdate;
			period <= periodBoundary;
			period += BigInt(SUBSCRIPTION_DURATION)
		) {
			periods.push(period);
		}

		const [currentSharePrice, periodShares, receiverAmountToExpire] = await Promise.all([
			readContract(config, { ...contract, functionName: "convertToShares", args: [token.divisor] }),
			multicall(config, {
				chainId,
				contracts: periods.map((period) => ({
					address: token.subsContract,
					abi: SUBSCRIPTIONS_ABI,
					functionName: "sharesPerPeriod" as const,
					args: [period],
				})),
			}),
			multicall(config, {
				chainId,
				contracts: periods.map((period) => ({
					address: token.subsContract,
					abi: SUBSCRIPTIONS_ABI,
					functionName: "receiverAmountToExpire" as const,
					args: [receiver, period],
				})),
			}),
		]);

		for (const [i, { result: shares }] of periodShares.entries()) {
			const finalShares = shares === undefined || shares === 0n ? currentSharePrice : shares;
			amountPerPeriod -= receiverAmountToExpire[i].result ?? 0n;
			balance += (amountPerPeriod * finalShares) / token.divisor;
		}
	}

	return readContract(config, { ...contract, functionName: "convertToAssets", args: [balance] });
}

async function calculateAvailableToClaimNextMonth({
	token,
	receiver,
	chainId,
}: {
	token: ITokenByChain;
	receiver: Address;
	chainId: TChain;
}) {
	const contract = { address: token.subsContract, abi: SUBSCRIPTIONS_ABI, chainId };

	const [, amountPerPeriod, lastUpdate] = await readContract(config, {
		...contract,
		functionName: "receiverBalances",
		args: [receiver],
	});

	if (lastUpdate === 0n) {
		return 0n;
	}

	let currentPeriod = await readContract(config, { ...contract, functionName: "currentPeriod" });

	let totalForNextMonth = amountPerPeriod;
	while (currentPeriod < BigInt(Math.floor(Date.now() / 1e3))) {
		totalForNextMonth -= await readContract(config, {
			...contract,
			functionName: "receiverAmountToExpire",
			args: [receiver, currentPeriod],
		});
		currentPeriod += BigInt(SUBSCRIPTION_DURATION);
	}
	return totalForNextMonth;
}

interface IClaimableToken extends ITokenByChain {
	claimable: bigint;
}

// Tokens whose read fails or comes back zero are left out.
async function claimablesOnAllContracts(
	chainId: TChain,
	calculate: (token: ITokenByChain) => Promise<bigint>,
) {
	const tokens = tokensByChain[chainId];
	const results = await Promise.allSettled(tokens.map(calculate));

	const claimables: Array<IClaimableToken> = [];
	for (const [i, result] of results.entries()) {
		if (result.status === "fulfilled" && result.value !== 0n) {
			claimables.push({ ...tokens[i], claimable: result.value });
		}
	}
	return claimables;
}

function claimableNow(receiver: Address, chainId: TChain) {
	return claimablesOnAllContracts(chainId, (token) =>
		calculateAvailableToClaim({ token, receiver, chainId }),
	);
}

function claimableNextMonth(receiver: Address, chainId: TChain) {
	return claimablesOnAllContracts(chainId, (token) =>
		calculateAvailableToClaimNextMonth({ token, receiver, chainId }),
	);
}

function sumClaimables(results: Array<{ data?: Array<IClaimableToken> }>) {
	let total = 0;
	for (const { data } of results) {
		for (const token of data ?? []) {
			total += Number(formatUnits(token.claimable, token.decimals));
		}
	}
	return total;
}

function ClaimByToken({
	token,
	chain,
	disabled,
	refetch,
}: {
	token: IClaimableToken;
	chain: Chain & { id: TChain };
	disabled?: boolean;
	refetch: () => void;
}) {
	const { address, chain: chainOnWallet } = useConnection();
	const { mutate: switchChain } = useSwitchChain();

	const { mutate: claimBalance, isPending: confirmingClaim } = useClaim();

	return (
		<span className="flex items-center justify-center gap-1 border p-1">
			<img
				src={`https://token-icons.llamao.fi/icons/tokens/${chain.id}/${token.address.toLowerCase()}`}
				width={16}
				height={16}
				alt=""
			/>
			<span>{`${formatNum(formatUnits(token.claimable, token.decimals), 2)} ${token.name}`}</span>
			{disabled ? null : chain.id === chainOnWallet?.id ? (
				<button
					type="button"
					className="ml-2 rounded-lg bg-[#13785a] px-3 py-1 text-sm text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
					disabled={!address || confirmingClaim}
					onClick={() => {
						claimBalance(
							{ subsContract: token.subsContract, chainId: chain.id, toClaim: token.claimable },
							{ onSuccess: refetch },
						);
					}}
				>
					{confirmingClaim ? "..." : "Claim"}
				</button>
			) : (
				<button
					type="button"
					className="ml-2 rounded-lg bg-[#13785a] px-3 py-1 text-sm text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
					onClick={() => switchChain({ chainId: chain.id })}
				>
					Switch network
				</button>
			)}
		</span>
	);
}

function ClaimByChain({ chain }: { chain: Chain & { id: TChain } }) {
	const { address, isConnected } = useConnection();

	const {
		data: claimablesByToken,
		isLoading: fetchingClaimables,
		error: errorFetchingClaimables,
		refetch: refetchClaimable,
	} = useQuery({
		queryKey: ["claimable", address, chain.id],
		queryFn: address ? () => claimableNow(address, chain.id) : skipToken,
		refetchInterval: 20_000,
		staleTime: 20_000,
		refetchOnWindowFocus: false,
	});

	const {
		data: claimablesNextMonth,
		isLoading: fetchingClaimablesNextMonth,
		error: errorFetchingClaimablesNextMonth,
	} = useQuery({
		queryKey: ["claimable-next-month", address, chain.id],
		queryFn: address ? () => claimableNextMonth(address, chain.id) : skipToken,
		refetchInterval: 20_000,
		staleTime: 20_000,
		refetchOnWindowFocus: false,
	});

	const hydrated = useHydrated();

	return (
		<tr>
			<td className="border px-4 py-2">
				<span className="flex items-center gap-1">
					<img
						src={`https://icons.llamao.fi/icons/chains/rsz_${chainIdToNames[chain.id].iconServerName}?w=48&h=48`}
						alt=""
						className="h-5 w-5 rounded-full"
					/>
					<span>{chain.name}</span>
				</span>
			</td>
			<td className="border px-4 py-2 text-center">
				{!hydrated || fetchingClaimables ? (
					<span className="inline-block h-4 w-8 animate-pulse rounded-sm bg-gray-400" />
				) : !isConnected || errorFetchingClaimables ? (
					"-"
				) : claimablesByToken && claimablesByToken.length > 0 ? (
					<span className="flex flex-col gap-2">
						{claimablesByToken.map((token) => (
							<ClaimByToken
								token={token}
								chain={chain}
								key={`claimable-${token.address}`}
								refetch={() => void refetchClaimable()}
							/>
						))}
					</span>
				) : (
					"-"
				)}
			</td>
			<td className="border px-4 py-2 text-center">
				{!hydrated || fetchingClaimablesNextMonth ? (
					<span className="inline-block h-4 w-8 animate-pulse rounded-sm bg-gray-400" />
				) : !isConnected || errorFetchingClaimablesNextMonth ? (
					"-"
				) : claimablesNextMonth && claimablesNextMonth.length > 0 ? (
					<span className="flex flex-col gap-2">
						{claimablesNextMonth.map((token) => (
							<ClaimByToken
								token={token}
								chain={chain}
								refetch={() => void refetchClaimable()}
								key={`claimable-${token.address}`}
								disabled
							/>
						))}
					</span>
				) : (
					"-"
				)}
			</td>
		</tr>
	);
}

export function Claim() {
	const { address } = useConnection();

	const totalClaimables = useQueries({
		queries: config.chains.map((chain) => ({
			queryKey: ["claimable", address, chain.id],
			queryFn: address ? () => claimableNow(address, chain.id) : skipToken,
			refetchInterval: 20_000,
			staleTime: 20_000,
			refetchOnWindowFocus: false,
		})),
	});

	const totalClaimablesNextMonth = useQueries({
		queries: config.chains.map((chain) => ({
			queryKey: ["claimable-next-month", address, chain.id],
			queryFn: address ? () => claimableNextMonth(address, chain.id) : skipToken,
			refetchInterval: 20_000,
			staleTime: 20_000,
			refetchOnWindowFocus: false,
		})),
	});

	return (
		<div className="overflow-x-auto">
			<div className="mb-5 flex flex-col gap-2 text-sm">
				<p className="flex items-center gap-2">
					<span>Total claimable:</span>
					{totalClaimables.some((d) => d.isFetching) ? (
						<span className="inline-block h-4 w-16 animate-pulse rounded-sm bg-gray-400" />
					) : (
						<span>{`$${formatNum(sumClaimables(totalClaimables), 2)}`}</span>
					)}
				</p>
				<p className="flex items-center gap-2">
					<span>Total claimable next month:</span>
					{totalClaimablesNextMonth.some((d) => d.isFetching) ? (
						<span className="inline-block h-4 w-16 animate-pulse rounded-sm bg-gray-400" />
					) : (
						<span>{`$${formatNum(sumClaimables(totalClaimablesNextMonth), 2)}`}</span>
					)}
				</p>
			</div>

			<table className="min-w-full border-collapse">
				<thead>
					<tr>
						<th className="border px-4 py-2 text-sm font-normal whitespace-nowrap">Chain</th>
						<th className="border px-4 py-2 text-sm font-normal whitespace-nowrap">Claimable</th>
						<th className="border px-4 py-2 text-sm font-normal whitespace-nowrap">
							Claimable next month
						</th>
					</tr>
				</thead>
				<tbody>
					{config.chains.map((chain) => (
						<ClaimByChain chain={chain} key={`claimable-${chain.id}`} />
					))}
				</tbody>
			</table>
		</div>
	);
}
