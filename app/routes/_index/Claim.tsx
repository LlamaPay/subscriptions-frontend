import { useQueries, useQuery } from "@tanstack/react-query";
import {
	http,
	type Chain,
	createPublicClient,
	formatUnits,
	getContract,
} from "viem";
import { useAccount, useSwitchChain } from "wagmi";

import { useHydrated } from "~/hooks/useHydrated";
import { SUBSCRIPTIONS_ABI } from "~/lib/abi.subscriptions";
import {
	type ITokenByChain,
	LLAMAPAY_CHAINS_LIB,
	SUBSCRIPTION_DURATION,
	tokensByChain,
} from "~/lib/constants";
import { formatNum } from "~/utils/formatNum";

import { chainIdToNames, config } from "~/lib/wallet";
import { useClaim } from "./actions";

async function calculateAvailableToClaim({
	token,
	receiver,
	chain,
}: {
	token: ITokenByChain;
	receiver?: string;
	chain: Chain;
}) {
	if (!receiver || !(LLAMAPAY_CHAINS_LIB as any)[chain.id]) return null;

	const client = createPublicClient({
		chain: chain,
		transport: http((LLAMAPAY_CHAINS_LIB as any)[chain.id].rpc),
	});

	const contract: any = getContract({
		address: token.subsContract,
		abi: SUBSCRIPTIONS_ABI,
		client: client as any,
	});

	try {
		const currentTimestamp = Math.floor(Date.now() / 1e3);

		const receiverBalance = await contract.read.receiverBalances([receiver]);

		// eslint-disable-next-line
		let [balance, amountPerPeriod, lastUpdate]: [bigint, bigint, bigint] =
			receiverBalance;

		const periodBoundary =
			BigInt(currentTimestamp) - BigInt(SUBSCRIPTION_DURATION);

		if (lastUpdate <= BigInt(periodBoundary) && lastUpdate !== 0n) {
			const periods = [];
			for (
				let period = lastUpdate;
				period <= periodBoundary;
				period += BigInt(SUBSCRIPTION_DURATION)
			) {
				periods.push(period);
			}

			const [currentSharePrice, periodShares, receiverAmountToExpire] =
				await Promise.all([
					contract.read.convertToShares([token.divisor]),
					client
						.multicall({
							contracts: periods.map((p) => ({
								address: token.subsContract,
								abi: SUBSCRIPTIONS_ABI,
								functionName: "sharesPerPeriod",
								args: [p],
							})),
						})
						.then((data: any) => data.map((x: any) => x.result)),
					client
						.multicall({
							contracts: periods.map((p) => ({
								address: token.subsContract,
								abi: SUBSCRIPTIONS_ABI,
								functionName: "receiverAmountToExpire",
								args: [receiver, p],
							})),
						})
						.then((data: any) => data.map((x: any) => x.result)),
				]);

			periodShares.forEach((shares: any, i: number) => {
				const finalShares =
					!shares || shares === 0n ? currentSharePrice : shares;
				amountPerPeriod -= receiverAmountToExpire[i] ?? 0n;
				balance +=
					BigInt(amountPerPeriod * finalShares) / BigInt(token.divisor);
			});
		}

		const claimable: bigint = await contract.read.convertToAssets([balance]);

		return claimable;
	} catch (error) {
		throw new Error(
			error instanceof Error ? error.message : "Failed to fetch claimables",
		);
	}
}

async function calculateAvailableToClaimNextMonth({
	token,
	receiver,
	chain,
}: {
	token: ITokenByChain;
	receiver?: string;
	chain: Chain;
}) {
	if (!receiver || !(LLAMAPAY_CHAINS_LIB as any)[chain.id]) return null;

	const client = createPublicClient({
		chain,
		transport: http((LLAMAPAY_CHAINS_LIB as any)[chain.id].rpc),
	});

	try {
		const contract: any = getContract({
			address: token.subsContract,
			abi: SUBSCRIPTIONS_ABI,
			client: client as any,
		});

		const receiverBalance = await contract.read.receiverBalances([receiver]);
		// eslint-disable-next-line
		const [balance, amountPerPeriod, lastUpdate]: [bigint, bigint, bigint] =
			receiverBalance;
		if (lastUpdate === 0n) {
			return 0n;
		}
		let currentPeriod: bigint = await contract.read.currentPeriod();

		let totalForNextMonth = amountPerPeriod;
		while (currentPeriod < Date.now() / 1e3) {
			totalForNextMonth -= await contract.read.receiverAmountToExpire([
				receiver,
				currentPeriod,
			]);
			currentPeriod += BigInt(SUBSCRIPTION_DURATION);
		}
		return totalForNextMonth;
	} catch (error) {
		throw new Error(
			error instanceof Error
				? error.message
				: "Failed to fetch claimables next month",
		);
	}
}

interface IClaimableToken extends ITokenByChain {
	claimbale: bigint;
}

async function calcAvailableToClaimNextMonthOnAllContracts({
	receiver,
	chain,
}: {
	receiver?: string;
	chain: Chain;
}) {
	try {
		const data = await Promise.allSettled(
			tokensByChain[chain.id].map((token) =>
				calculateAvailableToClaimNextMonth({
					token,
					receiver,
					chain,
				}),
			),
		);

		const claimablesByToken = tokensByChain[chain.id].map((token, index) => ({
			...token,
			claimbale:
				data[index].status === "fulfilled" &&
				typeof data[index].value === "bigint"
					? data[index].value
					: null,
		}));

		return claimablesByToken.filter((token) =>
			token.claimbale ? true : false,
		) as Array<IClaimableToken>;
	} catch (error) {
		throw new Error(
			error instanceof Error
				? error.message
				: "Failed to fetch claimables next month",
		);
	}
}

const min = (a: bigint, b: bigint) => (a > b ? b : a);

async function calcAvailableToClaimNowOnAllContracts({
	receiver,
	chain,
}: {
	receiver?: string;
	chain: Chain;
}) {
	try {
		const data = await Promise.allSettled(
			tokensByChain[chain.id].map((token) =>
				calculateAvailableToClaim({
					token,
					receiver,
					chain,
				}),
			),
		);

		const claimablesByToken = tokensByChain[chain.id].map((token, index) => ({
			...token,
			claimbale:
				data[index].status === "fulfilled" &&
				typeof data[index].value === "bigint"
					? data[index].value
					: null,
		}));

		return claimablesByToken.filter((token) =>
			token.claimbale ? true : false,
		) as Array<IClaimableToken>;
	} catch (error) {
		throw new Error(
			error instanceof Error ? error.message : "Failed to fetch claimables",
		);
	}
}

const ClaimByToken = ({
	token,
	chain,
	disabled,
	refetch,
}: {
	token: IClaimableToken;
	chain: Chain;
	disabled?: boolean;
	refetch: () => void;
}) => {
	const { address, chain: chainOnWallet } = useAccount();
	const { switchChain } = useSwitchChain();

	const { mutateAsync: claimBalance, isPending: confirmingClaim } = useClaim();

	return (
		<>
			<span className="p-1 border flex items-center justify-center gap-1">
				<img
					src={`https://token-icons.llamao.fi/icons/tokens/${
						chain.id
					}/${token.address.toLowerCase()}`}
					width={16}
					height={16}
					alt=""
				/>
				<span>{`${formatNum(formatUnits(token.claimbale, token.decimals), 2)} ${
					token.name
				}`}</span>
				{!disabled ? (
					chain.id !== chainOnWallet?.id ? (
						<button
							className="ml-2 px-3 py-1 rounded-lg bg-[#13785a] text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black text-sm"
							onClick={() => switchChain({ chainId: chain.id })}
						>
							Switch network
						</button>
					) : (
						<button
							className="ml-2 px-3 py-1 rounded-lg bg-[#13785a] text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black text-sm"
							disabled={
								!address ||
								!chainOnWallet ||
								chainOnWallet.id !== chain.id ||
								confirmingClaim
							}
							onClick={() => {
								claimBalance?.({
									address: token.subsContract,
									chainId: chain.id,
									toClaim: token.claimbale,
								}).then(() => refetch());
							}}
						>
							{confirmingClaim ? "..." : "Claim"}
						</button>
					)
				) : null}
			</span>
		</>
	);
};

const ClaimByChain = ({ chain }: { chain: Chain }) => {
	const { address, isConnected } = useAccount();

	const {
		data: claimablesByToken,
		isLoading: fetchingClaimables,
		error: errorFetchingClaimables,
		refetch: refetchClaimable,
	} = useQuery({
		queryKey: ["claimable", address, chain.id],
		queryFn: () =>
			calcAvailableToClaimNowOnAllContracts({
				receiver: address,
				chain,
			}),
		refetchInterval: 20_000,
		staleTime: 20_000,
		refetchOnWindowFocus: false,
	});

	const {
		data: claimableNextMonth,
		isLoading: fetchingClaimablesNextMonth,
		error: errorFetchingClaimablesNextMonth,
	} = useQuery({
		queryKey: ["claimable-next-month", address, chain.id],
		queryFn: () =>
			calcAvailableToClaimNextMonthOnAllContracts({
				receiver: address,
				chain,
			}),
		refetchInterval: 20_000,
		staleTime: 20_000,
		refetchOnWindowFocus: false,
	});

	const hydrated = useHydrated();

	return (
		<>
			<tr>
				<td className="px-4 py-2 border">
					<span className="flex items-center gap-1">
						<img
							src={`https://icons.llamao.fi/icons/chains/rsz_${
								(chainIdToNames as any)[chain.id]?.iconServerName ?? ""
							}?w=48&h=48`}
							alt=""
							className="h-5 w-5 rounded-full"
						/>
						<span>{chain.name}</span>
					</span>
				</td>
				<td className="px-4 py-2 border text-center">
					{!hydrated || fetchingClaimables ? (
						<span className="inline-block h-4 w-8 animate-pulse rounded bg-gray-400" />
					) : !isConnected || errorFetchingClaimables ? (
						<>-</>
					) : (
						<>
							{claimablesByToken && claimablesByToken.length > 0 ? (
								<span className="flex flex-col gap-2">
									{claimablesByToken.map((token) => (
										<ClaimByToken
											token={token}
											chain={chain}
											key={`claimable-${token.address}`}
											refetch={refetchClaimable}
										/>
									))}
								</span>
							) : (
								"-"
							)}
						</>
					)}
				</td>
				<td className="px-4 py-2 border text-center">
					{!hydrated || fetchingClaimablesNextMonth ? (
						<span className="inline-block h-4 w-8 animate-pulse rounded bg-gray-400" />
					) : !isConnected || errorFetchingClaimablesNextMonth ? (
						<>-</>
					) : (
						<>
							{claimableNextMonth && claimableNextMonth.length > 0 ? (
								<span className="flex flex-col gap-2">
									{claimableNextMonth.map((token) => (
										<ClaimByToken
											token={token}
											chain={chain}
											refetch={refetchClaimable}
											key={`claimable-${token.address}`}
											disabled
										/>
									))}
								</span>
							) : (
								"-"
							)}
						</>
					)}
				</td>
			</tr>
		</>
	);
};

export const Claim = () => {
	const { address } = useAccount();

	const totalClaimables = useQueries({
		queries: config.chains.map((chain) => ({
			queryKey: ["claimable", address, chain.id],
			queryFn: () =>
				calcAvailableToClaimNowOnAllContracts({
					receiver: address,
					chain,
				}),
			refetchInterval: 20_000,
			staleTime: 20_000,
			refetchOnWindowFocus: false,
			enabled: address ? true : false,
		})),
	});

	const totalClaimable = totalClaimables.reduce((acc, curr) => {
		if (curr.data) {
			return (
				acc +
				curr.data.reduce((acc, curr) => {
					return acc + Number(formatUnits(curr.claimbale, curr.decimals));
				}, 0)
			);
		}
		return acc;
	}, 0);

	const isFetchingTotalClaimables = totalClaimables.some((d) => d.isFetching);

	const totalClaimablesNextMonth = useQueries({
		queries: config.chains.map((chain) => ({
			queryKey: ["claimable-next-month", address, chain.id],
			queryFn: () =>
				calcAvailableToClaimNextMonthOnAllContracts({
					receiver: address,
					chain,
				}),
			refetchInterval: 20_000,
			staleTime: 20_000,
			refetchOnWindowFocus: false,
			enabled: address ? true : false,
		})),
	});

	const totalClaimableNextMonth = totalClaimablesNextMonth.reduce(
		(acc, curr) => {
			if (curr.data) {
				return (
					acc +
					curr.data.reduce((acc, curr) => {
						return acc + Number(formatUnits(curr.claimbale, curr.decimals));
					}, 0)
				);
			}
			return acc;
		},
		0,
	);

	const isFetchingTotalClaimablesNextMonth = totalClaimablesNextMonth.some(
		(d) => d.isFetching,
	);

	return (
		<div className="overflow-x-auto">
			<div className="flex flex-col gap-2 mb-5 text-sm">
				<p className="flex items-center gap-2">
					<span>Total claimable:</span>
					{isFetchingTotalClaimables ? (
						<span className="inline-block h-4 w-16 animate-pulse rounded bg-gray-400" />
					) : (
						<span>{`$${formatNum(totalClaimable, 2)}`}</span>
					)}
				</p>
				<p className="flex items-center gap-2">
					<span>Total claimable next month:</span>
					{isFetchingTotalClaimablesNextMonth ? (
						<span className="inline-block h-4 w-16 animate-pulse rounded bg-gray-400" />
					) : (
						<span>{`$${formatNum(totalClaimableNextMonth, 2)}`}</span>
					)}
				</p>
			</div>

			<table className="min-w-full border-collapse">
				<thead>
					<tr>
						<th className="whitespace-nowrap px-4 py-2 text-sm font-normal border">
							Chain
						</th>
						<th className="whitespace-nowrap px-4 py-2 text-sm font-normal border">
							Claimable
						</th>
						<th className="whitespace-nowrap px-4 py-2 text-sm font-normal border">
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
};
