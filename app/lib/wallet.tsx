import { arbitrum, avalanche, base, blast, bsc, mainnet, optimism, polygon } from "viem/chains";
import { http, cookieStorage, createConfig, createStorage } from "wagmi";
import { coinbaseWallet, injected, metaMask, walletConnect } from "wagmi/connectors";

import { LLAMAPAY_CHAINS_LIB } from "./constants";

const projectId = "2b0fa925a6e30cf250c05823fa9ef890";

export const config = createConfig({
	chains: [mainnet, optimism, polygon, arbitrum, base, bsc, avalanche, blast],
	connectors: [
		metaMask({
			dapp: {
				name: "LlamaPay",
				url: "https://subscriptions.llamapay.io",
				iconUrl: "https://subscriptions.llamapay.io/favicon-32x32.png",
			},
		}),
		injected(),
		walletConnect({ projectId, telemetryEnabled: false }),
		coinbaseWallet({ appName: "LlamaPay" }),
	],
	// index.html is rendered at build time, so the connection is restored after hydration.
	ssr: true,
	// Cookies keep the connections saved before the app became an SPA.
	storage: createStorage({
		storage: cookieStorage,
	}),
	transports: {
		[mainnet.id]: http(LLAMAPAY_CHAINS_LIB[mainnet.id].rpc),
		[optimism.id]: http(LLAMAPAY_CHAINS_LIB[optimism.id].rpc),
		[polygon.id]: http(LLAMAPAY_CHAINS_LIB[polygon.id].rpc),
		[arbitrum.id]: http(LLAMAPAY_CHAINS_LIB[arbitrum.id].rpc),
		[base.id]: http(LLAMAPAY_CHAINS_LIB[base.id].rpc),
		[bsc.id]: http(LLAMAPAY_CHAINS_LIB[bsc.id].rpc),
		[avalanche.id]: http(LLAMAPAY_CHAINS_LIB[avalanche.id].rpc),
		[blast.id]: http(LLAMAPAY_CHAINS_LIB[blast.id].rpc),
	},
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}

export type TChain = (typeof config.chains)[number]["id"];

export function isSupportedChain(id: number): id is TChain {
	return Object.hasOwn(chainIdToNames, id);
}

export const chainIdToNames: Record<
	TChain,
	{
		name: string;
		llamapayServerName: string;
		iconServerName: string;
		blockExplorerUrl: string;
	}
> = {
	[mainnet.id]: {
		name: "Ethereum",
		llamapayServerName: "ethereum",
		iconServerName: "ethereum",
		blockExplorerUrl: mainnet.blockExplorers.default.url,
	},
	[polygon.id]: {
		name: "Polygon",
		llamapayServerName: "polygon",
		iconServerName: "polygon",
		blockExplorerUrl: polygon.blockExplorers.default.url,
	},
	[optimism.id]: {
		name: "Optimism",
		llamapayServerName: "optimism",
		iconServerName: "optimism",
		blockExplorerUrl: optimism.blockExplorers.default.url,
	},
	[arbitrum.id]: {
		name: "Arbitrum",
		llamapayServerName: "arbitrum",
		iconServerName: "arbitrum",
		blockExplorerUrl: arbitrum.blockExplorers.default.url,
	},
	[base.id]: {
		name: "Base",
		llamapayServerName: "base",
		iconServerName: "base",
		blockExplorerUrl: base.blockExplorers.default.url,
	},
	[bsc.id]: {
		name: "BSC",
		llamapayServerName: "bsc",
		iconServerName: "binance",
		blockExplorerUrl: bsc.blockExplorers.default.url,
	},
	[avalanche.id]: {
		name: "Avalanche",
		llamapayServerName: "avalanche",
		iconServerName: "avalanche",
		blockExplorerUrl: avalanche.blockExplorers.default.url,
	},
	[blast.id]: {
		name: "Blast",
		llamapayServerName: "blast",
		iconServerName: "blast",
		blockExplorerUrl: blast.blockExplorers.default.url,
	},
};

// Partial: the subscriptions API names chains by string and can return any chain.
export const llamapayChainNamesToIds: Partial<Record<string, TChain>> = Object.fromEntries(
	config.chains.map((chain) => [chainIdToNames[chain.id].llamapayServerName, chain.id]),
);
