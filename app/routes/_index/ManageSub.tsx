import * as Ariakit from "@ariakit/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { type Address, encodeFunctionData, erc20Abi, formatUnits } from "viem";
import { useConnection, useReadContract } from "wagmi";

import { Icon } from "~/components/Icon";
import { SUBSCRIPTIONS_ABI } from "~/lib/abi.subscriptions";
import type { IFormattedSub } from "~/types";
import { formatNum } from "~/utils/formatNum";
import { parseAmount } from "~/utils/parseAmount";
import { useCanBatchCalls } from "~/utils/useCanBatchCalls";

import { useApproveAndCall, useApproveToken, useUnsubscribe, useWithdraw } from "./actions";
import { calculateSubBalance } from "./data";

export function ManageSub({ data }: { data: IFormattedSub }) {
	if (data.tokenAddress === null || data.tokenDecimal === null || data.tokenDivisor === null) {
		return null;
	}

	return (
		<Content
			data={data}
			tokenAddress={data.tokenAddress}
			tokenDecimal={data.tokenDecimal}
			tokenDivisor={data.tokenDivisor}
		/>
	);
}

function Content({
	data,
	tokenAddress,
	tokenDecimal,
	tokenDivisor,
}: {
	data: IFormattedSub;
	tokenAddress: Address;
	tokenDecimal: number;
	tokenDivisor: bigint;
}) {
	const { address, chain } = useConnection();
	const queryClient = useQueryClient();

	const {
		data: balance,
		isLoading: fetchingBalance,
		error: errorFetchingBalance,
		refetch: refetchBalance,
	} = useQuery({
		queryKey: ["subBalance", data.id],
		queryFn: () => calculateSubBalance(data, tokenDivisor),
		refetchInterval: 20_000,
	});

	// UNSUBSCRIBE
	const {
		data: unsubscribeTxData,
		mutate: unsubscribe,
		isPending: confirmingUnsubscribeTx,
		reset,
	} = useUnsubscribe();

	// Expired subscriptions can still redeem leftover yield through unsubscribe.
	const isUnsubscribed = data.unsubscribed || unsubscribeTxData?.status === "success";

	// WITHDRAWALS
	const withdrawDialog = Ariakit.useDialogStore();
	const {
		data: withdrawTxData,
		mutate: withdrawBalanceFromSub,
		isPending: confirmingWithdrawTx,
		error: errorWithdrawTx,
	} = useWithdraw();

	// Wallets that batch calls approve and withdraw in one step.
	const canBatch = useCanBatchCalls();
	const {
		data: batchTxData,
		mutate: approveAndWithdraw,
		isPending: confirmingBatch,
		error: errorBatch,
		queued: withdrawalQueued,
	} = useApproveAndCall();

	const errorConfirmingWithdrawal = errorWithdrawTx ?? errorBatch;

	const [amountToWithdraw, setAmountToWithdraw] = useState("");
	// What stays subscribed: the balance minus the amount typed so far.
	const amountToDeposit = (balance ?? 0n) - (parseAmount(amountToWithdraw, tokenDecimal) ?? 0n);

	const disableWithdrawal = amountToDeposit < 0n;

	const onWithdrawn = (receipt: { status: "success" | "reverted" }) => {
		if (receipt.status === "success") {
			void refetchBalance();
			reset();
			queryClient.invalidateQueries();
			// hide, not toggle: a queued batch can land after the dialog was closed.
			withdrawDialog.hide();
		}
	};

	const confirmingWithdrawal = confirmingWithdrawTx || confirmingBatch;

	const handleWithdrawal = (e: React.SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();

		const calls = [
			encodeFunctionData({
				abi: SUBSCRIPTIONS_ABI,
				functionName: "unsubscribe",
				args: [
					BigInt(data.initialPeriod),
					BigInt(data.expirationDate),
					BigInt(data.amountPerCycle),
					data.receiver,
					BigInt(data.accumulator),
					BigInt(data.initialShares),
				],
			}),
		];

		if (amountToDeposit > 0n) {
			calls.push(
				encodeFunctionData({
					abi: SUBSCRIPTIONS_ABI,
					functionName: "subscribeForNextPeriod",
					args: [data.receiver, BigInt(data.amountPerCycle), amountToDeposit, 0n],
				}),
			);
		}

		if (canBatch) {
			approveAndWithdraw(
				{
					token: tokenAddress,
					chainId: data.chainId,
					spender: data.subsContract,
					approveAmount: isApproved ? null : amountToDeposit,
					call: encodeFunctionData({
						abi: SUBSCRIPTIONS_ABI,
						functionName: "batch",
						args: [calls, true],
					}),
				},
				{ onSuccess: onWithdrawn },
			);
		} else {
			withdrawBalanceFromSub(
				{ subsContract: data.subsContract, chainId: data.chainId, calls },
				{ onSuccess: onWithdrawn },
			);
		}
	};

	// TOKEN APPROVAL
	// get current allowance of user
	const {
		data: allowance,
		error: errorFetchingAllowance,
		refetch: refetchAllowance,
	} = useReadContract({
		address: tokenAddress,
		abi: erc20Abi,
		functionName: "allowance",
		args: address && [address, data.subsContract],
		chainId: data.chainId,
		query: {
			enabled: address !== undefined,
		},
	});

	// Re-subscribing what's left needs an allowance; withdrawing everything does not.
	const isApproved =
		amountToDeposit > 0n ? allowance !== undefined && allowance >= amountToDeposit : true;

	const {
		data: approveTxData,
		mutate: approveToken,
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

	const wrongChain = chain?.id !== data.chainId;
	const noAmount = amountToWithdraw.length === 0 || amountToWithdraw === "0";

	return (
		<>
			<td className="p-3 text-center">
				<span className="flex min-h-6 flex-nowrap items-center gap-1">
					{!fetchingBalance && balance !== undefined && balance !== 0n ? (
						<span className="whitespace-nowrap">{`$${formatNum(
							+formatUnits(balance, tokenDecimal),
							2,
						)}`}</span>
					) : null}
					{errorFetchingBalance ? (
						<Ariakit.TooltipProvider showTimeout={0}>
							<Ariakit.TooltipAnchor
								render={
									<Icon name="exclamation-circle" className="h-5 w-5 shrink-0 text-red-500" />
								}
							/>
							<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm break-all text-black">
								{errorFetchingBalance.message}
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
						className="rounded-lg bg-[#13785a] p-2 text-xs whitespace-nowrap text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
					>
						Top up
					</Link>
				) : null}
			</td>
			<td className="px-3 py-1">
				<div>
					<button
						type="button"
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
							type="button"
							className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-black/20"
							onClick={withdrawDialog.toggle}
						>
							<Icon className="h-4 w-4 shrink-0" name="x-icon" />

							<span className="sr-only">Close Dialog</span>
						</button>
						<form
							className="mx-auto flex w-full max-w-[450px] flex-col gap-4"
							onSubmit={handleWithdrawal}
						>
							<label className="flex flex-col gap-1">
								<span>Amount</span>

								<span className="relative isolate rounded-lg border border-black/15 bg-[#ffffff] p-3 pb-[26px] dark:border-white/5 dark:bg-[#141414]">
									<span className="absolute top-3 bottom-0 left-4 my-auto flex flex-col gap-2">
										<p className="text-4xl">$</p>
									</span>
									<input
										name="amountToWithdraw"
										className="relative z-10 w-full border-none bg-transparent pl-8 text-4xl outline-hidden!"
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
									<span className="absolute top-3 right-4 bottom-2 my-auto flex flex-col justify-end gap-2">
										<span className="flex items-center gap-1 text-xs">
											<span>Claimable:</span>
											{fetchingBalance ? (
												<span className="inline-block h-4 w-8 animate-pulse rounded-sm bg-gray-400" />
											) : errorFetchingBalance || balance === undefined ? (
												<span>-</span>
											) : (
												<>
													<span>{`$${formatNum(formatUnits(balance, tokenDecimal), 2)}`}</span>
													<button
														type="button"
														className="text-(--page-text-color-2) underline"
														onClick={() => setAmountToWithdraw(formatUnits(balance, tokenDecimal))}
													>
														Max
													</button>
												</>
											)}
										</span>
									</span>
								</span>
							</label>

							{canBatch ? (
								<button
									type="submit"
									className="rounded-lg bg-[#13785a] p-3 text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
									disabled={wrongChain || confirmingWithdrawal || disableWithdrawal || noAmount}
								>
									{confirmingWithdrawal ? "Confirming..." : "Withdraw"}
								</button>
							) : (
								<div className="flex flex-nowrap gap-4">
									<div className="flex flex-col justify-between gap-1">
										<div
											className="h-8 w-8 rounded-full border-2 border-black bg-black first-of-type:mt-3 data-[disabled=true]:bg-(--page-bg-color-2) data-[disabled=true]:opacity-40 dark:border-white dark:bg-white"
											data-disabled={
												wrongChain ||
												confirmingWithdrawal ||
												disableWithdrawal ||
												confirmingTokenApproval ||
												isApproved ||
												noAmount ||
												amountToDeposit === 0n
											}
										/>
										<div className="mx-auto min-h-[4px] w-[2px] flex-1 bg-black opacity-40 dark:bg-white" />
										<div
											className="mb-3 h-8 w-8 rounded-full border-2 border-black bg-black data-[disabled=true]:bg-(--page-bg-color-2) data-[disabled=true]:opacity-40 dark:border-white dark:bg-white"
											data-disabled={
												wrongChain ||
												confirmingWithdrawal ||
												disableWithdrawal ||
												confirmingTokenApproval ||
												!isApproved ||
												noAmount
											}
										/>
									</div>
									<div className="flex flex-1 flex-col gap-6">
										<button
											className="rounded-lg bg-[#13785a] p-3 text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
											disabled={
												wrongChain ||
												confirmingWithdrawal ||
												disableWithdrawal ||
												confirmingTokenApproval ||
												isApproved ||
												noAmount ||
												amountToDeposit === 0n
											}
											type="button"
											onClick={() => {
												approveToken(
													{
														token: tokenAddress,
														chainId: data.chainId,
														spender: data.subsContract,
														amount: amountToDeposit,
													},
													{ onSuccess: () => void refetchAllowance() },
												);
											}}
										>
											{confirmingTokenApproval
												? "Confirming..."
												: isApproved
													? "Approved"
													: "Approve"}
										</button>

										<button
											type="submit"
											className="rounded-lg bg-[#13785a] p-3 text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
											disabled={
												wrongChain ||
												confirmingWithdrawal ||
												disableWithdrawal ||
												confirmingTokenApproval ||
												!isApproved ||
												noAmount
											}
										>
											{confirmingWithdrawal ? "Confirming..." : "Withdraw"}
										</button>
									</div>
								</div>
							)}

							{errorFetchingAllowance ? (
								<p className="text-center text-sm break-all text-red-500">
									{errorFetchingAllowance.shortMessage}
								</p>
							) : null}

							{errorConfirmingTokenApproval ? (
								<p className="text-center text-sm break-all text-red-500">
									{errorConfirmingTokenApproval.message}
								</p>
							) : null}

							{errorConfirmingWithdrawal ? (
								<p className="text-center text-sm break-all text-red-500">
									{errorConfirmingWithdrawal.message}
								</p>
							) : null}

							{withdrawalQueued ? (
								<p className="text-center text-sm">
									Withdrawal queued in your wallet. This page continues once your wallet runs it.
								</p>
							) : null}

							{withdrawTxData?.status === "reverted" || batchTxData?.status === "reverted" ? (
								<p className="text-center text-sm break-all text-red-500">Transaction Reverted</p>
							) : null}

							{approveTxData?.status === "reverted" ? (
								<p className="text-center text-sm break-all text-red-500">Transaction Reverted</p>
							) : null}
						</form>
					</Ariakit.Dialog>
				</div>
			</td>
			<td className="px-3 py-1">
				<button
					type="button"
					className="rounded-lg bg-[#13785a] p-2 text-xs text-white disabled:opacity-60 dark:bg-[#23BF91] dark:text-black"
					disabled={!chain || confirmingUnsubscribeTx || confirmingBatch}
					onClick={() =>
						unsubscribe(data, {
							onSettled: () => {
								void refetchBalance();
								reset();
								queryClient.invalidateQueries();
							},
						})
					}
				>
					{confirmingUnsubscribeTx ? "Confirming..." : "Unsubscribe"}
				</button>
			</td>
		</>
	);
}
