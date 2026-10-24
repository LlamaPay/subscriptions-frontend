import { useMutation } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { type Address, type Hex, encodeFunctionData, erc20Abi } from "viem";
import {
	readContract,
	sendCalls,
	simulateContract,
	waitForCallsStatus,
	waitForTransactionReceipt,
	writeContract,
} from "wagmi/actions";

import { SUBSCRIPTIONS_ABI } from "~/lib/abi.subscriptions";
import { type TChain, config } from "~/lib/wallet";
import type { IFormattedSub } from "~/types";

export async function waitForTx(hash: Hex, chainId: TChain) {
	const receipt = await waitForTransactionReceipt(config, { hash, chainId });

	if (receipt.status === "success") {
		toast.success("Transaction Success", { id: `tx-success${hash}` });
	} else {
		toast.error("Transaction Failed", { id: `tx-failed${hash}` });
	}

	return receipt;
}

function errorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

// Every write is simulated first. wagmi 2.13+ no longer does it inside writeContract,
// so a call that would revert fails here instead of reaching the wallet and costing gas.
async function approveToken({
	token,
	chainId,
	spender,
	amount,
}: {
	token: Address;
	chainId: TChain;
	spender: Address;
	amount: bigint;
}) {
	try {
		const { request } = await simulateContract(config, {
			address: token,
			chainId,
			abi: erc20Abi,
			functionName: "approve",
			args: [spender, amount],
		});
		const hash = await writeContract(config, request);

		return await waitForTx(hash, chainId);
	} catch (error) {
		throw new Error(`[TOKEN-APPROVAL]: ${errorMessage(error, "Failed to approve token")}`, {
			cause: error,
		});
	}
}

export function useApproveToken() {
	return useMutation({ mutationFn: approveToken });
}

// For wallets that run several calls as one transaction (useCanBatchCalls): the
// approval, when the allowance is short, and the call that spends it go out
// together, so one never lands without the other. `call` is calldata for `spender`.
export async function approveAndCall({
	token,
	chainId,
	spender,
	approveAmount,
	call,
}: {
	token: Address;
	chainId: TChain;
	spender: Address;
	approveAmount: bigint | null;
	call: Hex;
}) {
	const calls: Array<{ to: Address; data: Hex }> = [];

	if (approveAmount !== null) {
		calls.push({
			to: token,
			data: encodeFunctionData({
				abi: erc20Abi,
				functionName: "approve",
				args: [spender, approveAmount],
			}),
		});
	}

	calls.push({ to: spender, data: call });

	try {
		const { id } = await sendCalls(config, { calls, chainId, forceAtomic: true });

		// No timeout: a Safe runs the batch only once enough owners have signed.
		const { status } = await waitForCallsStatus(config, { id, timeout: 0 });

		if (status === "success") {
			toast.success("Transaction Success", { id: `tx-success${id}` });
		} else {
			toast.error("Transaction Failed", { id: `tx-failed${id}` });
		}

		return { status: status === "success" ? ("success" as const) : ("reverted" as const) };
	} catch (error) {
		const msg = errorMessage(error, "Failed to send transaction");

		toast.error(msg.slice(0, 50), { id: `tx-failed${Date.now()}` });

		throw new Error(`[BATCH]: ${msg}`, { cause: error });
	}
}

export function useApproveAndCall() {
	return useMutation({ mutationFn: approveAndCall });
}

async function unsubscribe(data: IFormattedSub) {
	try {
		const { request } = await simulateContract(config, {
			address: data.subsContract,
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
			chainId: data.chainId,
		});
		const hash = await writeContract(config, request);

		return await waitForTx(hash, data.chainId);
	} catch (error) {
		const msg = errorMessage(error, "Failed to unsubscribe");

		toast.error(msg.slice(0, 50), { id: `tx-failed${Date.now()}` });

		throw new Error(`[UNSUBSCRIBE]: ${msg}`, { cause: error });
	}
}

export function useUnsubscribe() {
	return useMutation({ mutationFn: unsubscribe });
}

// `batch` runs the encoded subscription calls in one transaction.
async function withdraw({
	subsContract,
	chainId,
	calls,
}: {
	subsContract: Address;
	chainId: TChain;
	calls: Array<Hex>;
}) {
	try {
		const { request } = await simulateContract(config, {
			address: subsContract,
			abi: SUBSCRIPTIONS_ABI,
			functionName: "batch",
			chainId,
			args: [calls, true],
		});
		const hash = await writeContract(config, request);

		return await waitForTx(hash, chainId);
	} catch (error) {
		throw new Error(`[WITHDRAW]: ${errorMessage(error, "Failed to withdraw")}`, { cause: error });
	}
}

export function useWithdraw() {
	return useMutation({ mutationFn: withdraw });
}

async function claim({
	subsContract,
	chainId,
	toClaim,
}: {
	subsContract: Address;
	chainId: TChain;
	toClaim: bigint;
}) {
	try {
		const shares = await readContract(config, {
			address: subsContract,
			abi: SUBSCRIPTIONS_ABI,
			functionName: "convertToShares",
			chainId,
			args: [toClaim],
		});

		const { request } = await simulateContract(config, {
			address: subsContract,
			abi: SUBSCRIPTIONS_ABI,
			functionName: "claim",
			chainId,
			args: [toClaim < shares ? toClaim : shares],
		});
		const hash = await writeContract(config, request);

		return await waitForTx(hash, chainId);
	} catch (error) {
		const msg = errorMessage(error, "Failed to claim v1");

		toast.error(msg.slice(0, 50), { id: `tx-failed${Date.now()}` });

		throw new Error(`[CLAIM]: ${msg}`, { cause: error });
	}
}

export function useClaim() {
	return useMutation({ mutationFn: claim });
}
