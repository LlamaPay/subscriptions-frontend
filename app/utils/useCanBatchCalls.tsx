import { useCapabilities, useConnection } from "wagmi";

// Whether the wallet runs several calls as one atomic transaction (EIP-5792): a Safe,
// in the Safe App or over WalletConnect, or a smart-account wallet. Those wallets get
// approve and create in one batch, and several vesting streams at once.
export function useCanBatchCalls() {
	const { chain } = useConnection();

	const { data: capabilities } = useCapabilities({
		chainId: chain?.id,
		// Most wallets lack wallet_getCapabilities and keep the separate approve step.
		query: { retry: false },
	});

	// The Safe App provider still reports the older atomicBatch capability.
	const batch: { atomic?: { status: string }; atomicBatch?: { supported: boolean } } | undefined =
		capabilities;

	return batch?.atomic?.status === "supported" || batch?.atomicBatch?.supported === true;
}
