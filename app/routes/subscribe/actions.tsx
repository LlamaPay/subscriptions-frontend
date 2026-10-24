import { useMutation } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { optimism } from "viem/chains";
import { writeContract } from "wagmi/actions";

import { SUBSCRIPTIONS_ABI } from "~/lib/abi.subscriptions";
import { config } from "~/lib/wallet";

import { waitForTx } from "../_index/actions";

async function subscribe({
	subsContract,
	receiver,
	amountPerCycle,
	amountForFuture,
}: {
	subsContract: Address;
	receiver: Address;
	amountPerCycle: bigint;
	amountForFuture: bigint;
}) {
	try {
		const hash = await writeContract(config, {
			address: subsContract,
			abi: SUBSCRIPTIONS_ABI,
			functionName: "subscribe",
			chainId: optimism.id,
			dataSuffix: "0x0000000000000000000000000000000000000000000000000000000177bf6800",
			args: [receiver, amountPerCycle, amountForFuture],
		});

		return await waitForTx(hash, optimism.id);
	} catch (error) {
		throw new Error(
			`[SUBSCRIBE]: ${error instanceof Error ? error.message : "Failed to subscribe"}`,
			{ cause: error },
		);
	}
}

export function useSubscribe() {
	return useMutation({ mutationFn: subscribe });
}

// `batch` runs the encoded subscription calls in one transaction.
async function extendSubscription({
	subsContract,
	calls,
}: {
	subsContract: Address;
	calls: Array<Hex>;
}) {
	try {
		const hash = await writeContract(config, {
			address: subsContract,
			abi: SUBSCRIPTIONS_ABI,
			functionName: "batch",
			chainId: optimism.id,
			args: [calls, true],
		});

		return await waitForTx(hash, optimism.id);
	} catch (error) {
		throw new Error(
			`[EXTEND-SUB]: ${error instanceof Error ? error.message : "Failed to extend subscription"}`,
			{ cause: error },
		);
	}
}

export function useExtendSubscription() {
	return useMutation({ mutationFn: extendSubscription });
}
