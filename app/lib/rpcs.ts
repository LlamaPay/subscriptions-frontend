import { fallback, http } from "wagmi";

const getLlamaRpc = (chain: string) =>
	`https://rpc.llama-rpc.com/${chain}?source=llamapay-subscriptions`;

// LlamaRPC first, then the chain's own RPC where it runs one, then PublicNode and dRPC.
// Each public URL is in the list LlamaRPC itself uses (DefiLlama/rpc-aggregator,
// src/configs/public.json) and answered eth_chainId, eth_blockNumber and eth_call when added.
export const rpcUrls = {
	1: [
		getLlamaRpc("ethereum"),
		"https://ethereum-rpc.publicnode.com",
		"https://eth.drpc.org",
		"https://rpc.mevblocker.io",
	],
	10: [
		getLlamaRpc("optimism"),
		"https://mainnet.optimism.io",
		"https://optimism-rpc.publicnode.com",
		"https://optimism.drpc.org",
	],
	56: [
		getLlamaRpc("bsc"),
		"https://bsc-dataseed.bnbchain.org",
		"https://bsc-dataseed1.bnbchain.org",
		"https://bsc-rpc.publicnode.com",
	],
	137: [
		getLlamaRpc("polygon"),
		"https://rpc-mainnet.matic.quiknode.pro",
		"https://polygon-bor-rpc.publicnode.com",
		"https://polygon.drpc.org",
	],
	8453: [
		getLlamaRpc("base"),
		"https://mainnet.base.org",
		"https://base-rpc.publicnode.com",
		"https://base.drpc.org",
	],
	42161: [
		getLlamaRpc("arbitrum"),
		"https://arb1.arbitrum.io/rpc",
		"https://arbitrum-one-rpc.publicnode.com",
		"https://arbitrum.drpc.org",
	],
	43114: [
		getLlamaRpc("avax"),
		"https://api.avax.network/ext/bc/C/rpc",
		"https://avalanche-c-chain-rpc.publicnode.com",
		"https://avalanche.drpc.org",
	],
	// LlamaRPC answers some Blast reads with an empty body, so Blast goes to public RPCs only.
	81457: ["https://rpc.blast.io", "https://blast-rpc.publicnode.com", "https://blast.drpc.org"],
};

// A short timeout so a hanging RPC hands over to the next one, as in llamaswap-interface-v2.
export function rpcTransport(chainId: keyof typeof rpcUrls) {
	return fallback(rpcUrls[chainId].map((url) => http(url, { timeout: 3_000 })));
}
