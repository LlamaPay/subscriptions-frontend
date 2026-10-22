import * as Ariakit from "@ariakit/react";
import { Link } from "@remix-run/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	http,
	createPublicClient,
	encodeFunctionData,
	erc20Abi,
	formatUnits,
	getContract,
	parseUnits,
} from "viem";
import { useAccount, useReadContract } from "wagmi";

import { Icon } from "~/components/Icon";
import { SUBSCRIPTIONS_ABI } from "~/lib/abi.subscriptions";
import { LLAMAPAY_CHAINS_LIB, SUBSCRIPTION_DURATION } from "~/lib/constants";
import { config } from "~/lib/wallet";
import type { IFormattedSub } from "~/types";
import { formatNum } from "~/utils/formatNum";
import { useApproveToken, useUnsubscribe, useWithdraw } from "./actions";

export async function calculateSubBalance(sub: IFormattedSub) {
	if (!sub || !sub.tokenDecimal || !sub.tokenDivisor || !sub.tokenAddress)
		return null;

	const supportedChain = config.chains.find(
		(chain) => chain.id === sub.chainId,
	);

	if (!supportedChain) return null;

	const client = createPublicClient({
		chain: supportedChain,
		transport: http((LLAMAPAY_CHAINS_LIB as any)[sub.chainId].rpc),
	});

	const contract: any = getContract({
		address: sub.subsContract as `0x${string}`,
		abi: SUBSCRIPTIONS_ABI,
		client: client as any,
	});

	const initialShares = BigInt(sub.initialShares);

	const currentTimestamp = BigInt(Math.floor(Date.now() / 1e3));

	if (+sub.expirationDate > currentTimestamp) {
		// eslint-disable-next-line
		let [sharesAccumulator, currentPeriod]: [bigint, bigint] =
			await Promise.all([
				contract.read.sharesAccumulator(),
				contract.read.currentPeriod(),
			]);

		if (currentPeriod + BigInt(SUBSCRIPTION_DURATION) < currentTimestamp) {
			const shares: bigint = await contract.read.convertToShares([
				sub.tokenDivisor,
			]);
			sharesAccumulator +=
				((currentTimestamp - BigInt(currentPeriod)) /
					BigInt(SUBSCRIPTION_DURATION)) *
				shares;
		}

		const sharesPaid =
			((sharesAccumulator - BigInt(sub.accumulator)) *
				BigInt(sub.amountPerCycle)) /
			BigInt(sub.tokenDivisor);

		const sharesLeft = initialShares - sharesPaid;

		const balance: bigint = await contract.read.convertToAssets([sharesLeft]);

		return balance;
	}

	const periods = [];

	for (
		let period = +sub.initialPeriod;
		period < +sub.expirationDate;
		period += SUBSCRIPTION_DURATION
	) {
		periods.push(period);
	}

	const [currentSharePrice, periodShares]: [bigint, Array<bigint>] =
		await Promise.all([
			contract.read.convertToShares([sub.tokenDivisor]),
			client
				.multicall({
					contracts: periods.map((p) => ({
						address: sub.subsContract as `0x${string}`,
						abi: SUBSCRIPTIONS_ABI,
						functionName: "sharesPerPeriod",
						args: [p],
					})),
				})
				.then((data: any) => data.map((x: any) => x.result)),
		]);

	let subsetAccumulator = 0n;

	for (const shares of periodShares) {
		const finalShares = !shares || shares === 0n ? currentSharePrice : shares;
		subsetAccumulator += finalShares;
	}

	const balance: bigint = await contract.read.convertToAssets([
		initialShares -
			(subsetAccumulator * BigInt(sub.amountPerCycle)) /
				BigInt(sub.tokenDivisor),
	]);
	return balance;
}

export const ManageSub = ({ data }: { data: IFormattedSub }) => {
	if (!data.tokenAddress || !data.tokenDecimal || !data.tokenDivisor) {
		return null;
	}

	return (
		<Content
			data={data}
			tokenAddress={data.tokenAddress}
			tokenDecimal={data.tokenDecimal}
		/>
	);
};

const Content = ({
	data,
	tokenAddress,
	tokenDecimal,
}: { data: IFormattedSub; tokenAddress: string; tokenDecimal: number }) => {
	const { address, chain } = useAccount();
	const queryClient = useQueryClient();

	const {
		data: balance,
		isLoading: fetchingBalance,
		error: errorFetchingBalance,
		refetch: refetchBalance,
	} = useQuery({
		queryKey: ["subBalance", data.id],
		queryFn: () => calculateSubBalance(data),
		refetchInterval: 20_000,
	});

	// UNSUBSCRIBE
	const {
		data: unsubscribeTxData,
		mutateAsync: unsubscribe,
		isPending: confirmingUnsubscribeTx,
		reset,
	} = useUnsubscribe();

	// Expired subscriptions can still redeem leftover yield through unsubscribe.
	const isUnsubscribed =
		data.unsubscribed || unsubscribeTxData?.status === "success" ? true : false;

	// WITHDRAWALS
	const withdrawDialog = Ariakit.useDialogStore({ animated: true });
	const {
		data: withdrawTxData,
		mutateAsync: withdrawBalanceFromSub,
		isPending: confirmingWithdrawal,
		error: errorConfirmingWithdrawal,
	} = useWithdraw();

	const [amountToWithdraw, setAmountToWithdraw] = useState("");
	const amountToDeposit =
		(balance ?? 0n) - parseUnits(amountToWithdraw, tokenDecimal);

	const disableWithdrawal = amountToDeposit < 0n;

	const handleWithdrawal = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		const unsubscribe = encodeFunctionData({
			abi: SUBSCRIPTIONS_ABI,
			functionName: "unsubscribe",
			args: [
				BigInt(data.initialPeriod),
				BigInt(data.expirationDate),
				BigInt(data.amountPerCycle),
				data.receiver as `0x${string}`,
				BigInt(data.accumulator),
				BigInt(data.initialShares),
			],
		});

		const calls = [unsubscribe];

		if (amountToDeposit > 0n) {
			const subscribeForNextPeriod = encodeFunctionData({
				abi: SUBSCRIPTIONS_ABI,
				functionName: "subscribeForNextPeriod",
				args: [
					data.receiver as `0x${string}`,
					BigInt(data.amountPerCycle),
					amountToDeposit,
					0n,
				],
			});
			calls.push(subscribeForNextPeriod);
		}

		withdrawBalanceFromSub?.({
			address: data.subsContract as `0x${string}`,
			chainId: data.chainId,
			args: [calls, true],
		}).then((data) => {
			if (data.status === "success") {
				refetchBalance();
				reset();
				queryClient.invalidateQueries();
				withdrawDialog.toggle();
			}
		});
	};

	// TOKEN APPROVAL
	// get current DAI allowance of user
	const {
		data: allowance,
		error: errorFetchingAllowance,
		refetch: refetchAllowance,
	} = useReadContract({
		address: tokenAddress as `0x${string}`,
		abi: erc20Abi,
		functionName: "allowance",
		args: address && [address, data.subsContract as `0x${string}`],
		chainId: data.chainId,
		query: {
			enabled: address ? true : false,
		},
	});

	// check if input amount is gte to allowance
	const isApproved =
		amountToDeposit > 0n
			? allowance
				? allowance >= amountToDeposit
				: false
			: true;

	const {
		data: approveTxData,
		mutateAsync: approveToken,
		isPending: confirmingTokenApproval,
		error: errorConfirmingTokenApproval,
	} = useApproveToken();

	// Hide table cells if sub expired/cancelled/unsubscribed
	if (isUnsubscribed) {
		return (
			<>
				<td className="p-3 text-center" />
				<td className="p-3 text-center" />
				<td className="p-3 text-center" />
				<td className="p-3 text-center" />
			</>
		);
	}

	return (
		<>
			<td className="p-3 text-center">
				<span className="flex min-h-[1.5rem] flex-nowrap items-center gap-1">
					{!fetchingBalance && balance ? (
						<>
							<span className="whitespace-nowrap">{`$${formatNum(
								+formatUnits(balance, tokenDecimal),
								2,
							)}`}</span>
						</>
					) : null}
					{errorFetchingBalance ? (
						<Ariakit.TooltipProvider showTimeout={0}>
							<Ariakit.TooltipAnchor
								render={
									<Icon
										name="exclamation-circle"
										className="h-5 w-5 flex-shrink-0 text-red-500"
									/>
								}
							/>
							<Ariakit.Tooltip className="break-all max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
								{(errorFetchingBalance as any)?.message ??
									"Failed to fetch available balance"}
							</Ariakit.Tooltip>
						</Ariakit.TooltipProvider>
					) : null}
				</span>
			</td>
			<td className="px-3 py-1">
				{data.type === "old" ? (
					<Link
						to={`/subscribe?to=${data.receiver}&amount=${formatUnits(
							BigInt(data.amountPerCycle),
							tokenDecimal,
						)}`}
						className="whitespace-nowrap rounded-lg bg-[#13785a] p-2 text-xs text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
					>
						Top up
					</Link>
				) : null}
			</td>
			<td className="px-3 py-1">
				<div>
					<button
						className="rounded-lg bg-[#13785a] p-2 text-xs text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
						disabled={!chain}
						onClick={withdrawDialog.toggle}
					>
						Withdraw
					</button>
					<Ariakit.Dialog
						store={withdrawDialog}
						backdrop={<div className="dialog-backdrop" />}
						className="dialog flex flex-col gap-8"
					>
						<button
							className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-black/20"
							onClick={withdrawDialog.toggle}
						>
							<Icon className="h-4 w-4 flex-shrink-0" name="x-icon" />

							<span className="sr-only">Close Dialog</span>
						</button>
						<form
							className="mx-auto flex w-full max-w-[450px] flex-col gap-4"
							onSubmit={handleWithdrawal}
						>
							<label className="flex flex-col gap-1">
								<span>Amount</span>

								<span className="relative isolate rounded-lg border border-black/[0.15] bg-[#ffffff] p-3 pb-[26px] dark:border-white/5 dark:bg-[#141414]">
									<span className="absolute bottom-0 left-4 top-3 my-auto flex flex-col gap-2">
										<p className="text-4xl">$</p>
									</span>
									<input
										name="amountToWithdraw"
										className="relative z-10 w-full border-none bg-transparent pl-8 text-4xl !outline-none"
										required
										autoComplete="off"
										autoCorrect="off"
										type="text"
										pattern="^[0-9]*[.,]?[0-9]*$"
										placeholder="0.0"
										minLength={1}
										maxLength={79}
										spellCheck="false"
										inputMode="decimal"
										title="Enter numbers only."
										value={amountToWithdraw}
										onChange={(e) => {
											if (!Number.isNaN(Number(e.target.value))) {
												setAmountToWithdraw(e.target.value.trim());
											}
										}}
										disabled={confirmingWithdrawal}
									/>
									<span className="absolute bottom-2 right-4 top-3 my-auto flex flex-col justify-end gap-2">
										<p className="flex items-center gap-1 text-xs">
											<span>Claimable:</span>
											{fetchingBalance ? (
												<span className="inline-block h-4 w-8 animate-pulse rounded bg-gray-400" />
											) : errorFetchingBalance ? (
												<span>-</span>
											) : (
												<>
													<span>
														{typeof balance === "bigint"
															? `$${formatNum(
																	formatUnits(balance, tokenDecimal),
																	2,
																)}`
															: "-"}
													</span>
													<button
														type="button"
														className="text-[var(--page-text-color-2)] underline"
														onClick={() =>
															setAmountToWithdraw(
																balance
																	? formatUnits(balance, tokenDecimal)
																	: "0",
															)
														}
													>
														Max
													</button>
												</>
											)}
										</p>
									</span>
								</span>
							</label>

							<div className="flex flex-nowrap gap-4">
								<div className="flex flex-col justify-between gap-1">
									<div
										className="h-8 w-8 rounded-full border-2 border-black bg-black first-of-type:mt-3 data-[disabled=true]:bg-[var(--page-bg-color-2)] data-[disabled=true]:opacity-40 dark:border-white dark:bg-white"
										data-disabled={
											!chain ||
											chain.id !== data.chainId ||
											confirmingWithdrawal ||
											disableWithdrawal ||
											confirmingTokenApproval ||
											isApproved ||
											amountToWithdraw.length === 0 ||
											amountToWithdraw === "0" ||
											amountToDeposit === 0n
										}
									/>
									<div className="mx-auto min-h-[4px] w-[2px] flex-1 bg-black opacity-40 dark:bg-white" />
									<div
										className="mb-3 h-8 w-8 rounded-full border-2 border-black bg-black data-[disabled=true]:bg-[var(--page-bg-color-2)] data-[disabled=true]:opacity-40 dark:border-white dark:bg-white"
										data-disabled={
											!chain ||
											chain.id !== data.chainId ||
											confirmingWithdrawal ||
											disableWithdrawal ||
											confirmingTokenApproval ||
											!isApproved ||
											amountToWithdraw.length === 0 ||
											amountToWithdraw === "0"
										}
									/>
								</div>
								<div className="flex flex-1 flex-col gap-6">
									<button
										className="rounded-lg bg-[#13785a] p-3 text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
										disabled={
											!chain ||
											chain.id !== data.chainId ||
											confirmingWithdrawal ||
											disableWithdrawal ||
											confirmingTokenApproval ||
											isApproved ||
											amountToWithdraw.length === 0 ||
											amountToWithdraw === "0" ||
											amountToDeposit === 0n
										}
										type="button"
										onClick={() => {
											approveToken?.({
												address: tokenAddress as `0x${string}`,
												chainId: data.chainId,
												subsContract: data.subsContract as `0x${string}`,
												amountToDeposit,
											}).then(() => {
												refetchAllowance();
											});
										}}
									>
										{confirmingTokenApproval
											? "Confirming..."
											: isApproved
												? "Approved"
												: "Approve"}
									</button>

									<button
										className="rounded-lg bg-[#13785a] p-3 text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
										disabled={
											!chain ||
											chain.id !== data.chainId ||
											confirmingWithdrawal ||
											disableWithdrawal ||
											confirmingTokenApproval ||
											!isApproved ||
											amountToWithdraw.length === 0 ||
											amountToWithdraw === "0"
										}
									>
										{confirmingWithdrawal ? "Confirming..." : "Withdraw"}
									</button>
								</div>
							</div>

							{errorFetchingAllowance ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-1
								>
									{(errorFetchingAllowance as any)?.shortMessage ??
										errorFetchingAllowance.message}
								</p>
							) : null}

							{errorConfirmingTokenApproval ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-2
								>
									{(errorConfirmingTokenApproval as any)?.shortMessage ??
										errorConfirmingTokenApproval.message}
								</p>
							) : null}

							{errorConfirmingWithdrawal ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-3
								>
									{(errorConfirmingWithdrawal as any)?.shortMessage ??
										errorConfirmingWithdrawal.message}
								</p>
							) : null}

							{withdrawTxData?.status === "reverted" ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-4
								>
									Transaction Reverted
								</p>
							) : null}

							{approveTxData?.status === "reverted" ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-5
								>
									Transaction Reverted
								</p>
							) : null}
						</form>
					</Ariakit.Dialog>
				</div>
			</td>
			<td className="px-3 py-1">
				<button
					className="rounded-lg bg-[#13785a] p-2 text-xs text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
					disabled={!chain || !unsubscribe || confirmingUnsubscribeTx}
					onClick={() =>
						unsubscribe?.({
							address: data.subsContract as `0x${string}`,
							data,
						}).finally(() => {
							refetchBalance();
							reset();
							queryClient.invalidateQueries();
						})
					}
				>
					{confirmingUnsubscribeTx ? "Confirming..." : "Unsubscribe"}
				</button>
			</td>
		</>
	);
};
