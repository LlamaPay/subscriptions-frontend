import { useMutation } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { type Address, type Hex, erc20Abi } from "viem";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";

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
		const hash = await writeContract(config, {
			address: token,
			chainId,
			abi: erc20Abi,
			functionName: "approve",
			args: [spender, amount],
		});

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

async function unsubscribe(data: IFormattedSub) {
	try {
		const hash = await writeContract(config, {
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
		const hash = await writeContract(config, {
			address: subsContract,
			abi: SUBSCRIPTIONS_ABI,
			functionName: "batch",
			chainId,
			args: [calls, true],
		});

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

		const hash = await writeContract(config, {
			address: subsContract,
			abi: SUBSCRIPTIONS_ABI,
			functionName: "claim",
			chainId,
			args: [toClaim < shares ? toClaim : shares],
		});

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
