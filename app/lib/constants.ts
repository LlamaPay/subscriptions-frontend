import { parseUnits } from "viem";
import {
	arbitrum,
	avalanche,
	base,
	blast,
	bsc,
	mainnet,
	optimism,
	polygon,
} from "viem/chains";

function unscramble(str: string) {
	return str.split("").reduce((a, b) => {
		return a + String.fromCharCode(b.charCodeAt(0) + 8);
	}, "");
}
const apiKey = unscramble(".[^+0](,0[+1,*\\YZY\\[(*+Z,][/**,]");

export const LLAMAPAY_CHAINS_LIB = {
	[mainnet.id]: {
		rpc: "https://ethereum-rpc.publicnode.com",
		contracts: {},
		subgraphs: {},
	},
	[optimism.id]: {
		rpc: "https://optimism-rpc.publicnode.com",
		contracts: {
			subscriptions: "0x58B05eB0e58761E294297B334869F98983de0169",
			subscriptions_v1: "0x8B6473801e466E543BAf0cB6c7Ea1C9321C3C816",
		},
		subgraphs: {
			subscriptions: `https://gateway-arbitrum.network.thegraph.com/api/${apiKey}/subgraphs/id/7SAiBm4sRAfPkHniw45Pw83GnyfE953p3LFr87N6XXwC`,
		},
	},
	[polygon.id]: {
		rpc: "https://polygon-bor-rpc.publicnode.com",
		contracts: {},
		subgraphs: {},
	},
	[arbitrum.id]: {
		rpc: "https://arbitrum-one-rpc.publicnode.com",
		contracts: {},
		subgraphs: {},
	},
	[base.id]: {
		rpc: "https://base-rpc.publicnode.com",
		contracts: {},
		subgraphs: {},
	},
	[bsc.id]: {
		rpc: "https://bsc-rpc.publicnode.com",
		contracts: {},
		subgraphs: {},
	},
	[avalanche.id]: {
		rpc: "https://avalanche-c-chain-rpc.publicnode.com",
		contracts: {},
		subgraphs: {},
	},
	[blast.id]: {
		rpc: "https://blast-rpc.publicnode.com",
		contracts: {},
		subgraphs: {},
	},
} as const;

export const DAI_OPTIMISM = {
	address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" as `0x${string}`,
	name: "DAI",
	decimals: 18,
	img: "https://token-icons.llamao.fi/icons/tokens/10/0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
} as const;

export const SUBSCRIPTION_PERIOD = 30; // 30 DAYS
export const SUBSCRIPTION_DURATION = SUBSCRIPTION_PERIOD * 24 * 60 * 60; // in seconds

export const SUBSCRIPTION_AMOUNT_DIVISOR = parseUnits(
	"1",
	DAI_OPTIMISM.decimals,
);

export const MAINNET_ENS_RESOLVER =
	"0x3671aE578E63FdF66ad4F3E12CC0c0d71Ac7510C";

export interface ITokenByChain {
	address: `0x${string}`;
	name: string;
	decimals: number;
	divisor: bigint;
	subsContract: `0x${string}`;
}

export const tokensByChain: Record<number, Array<ITokenByChain>> = {
	[mainnet.id]: [
		{
			address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
			name: "USDT",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x4dd39132fa1B6D7fC8fA0D17c7528f20A89B076e",
		},
		{
			address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
			name: "USDC",
			decimals: 6,
			divisor: parseUnits("6", 18),
			subsContract: "0x15a86c79665B61a5747563D83aeD3337821a8A79",
		},
		{
			address: "0x6b175474e89094c44da98b954eedeac495271d0f",
			name: "DAI",
			decimals: 18,
			divisor: parseUnits("1", 18),
			subsContract: "0x35f6985553C6AB7202773A97cD3ae2d18606f247",
		},
	],
	[optimism.id]: [
		{
			address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
			name: "DAI",
			decimals: 18,
			divisor: parseUnits("1", 18),
			subsContract: "0x8B6473801e466E543BAf0cB6c7Ea1C9321C3C816",
		},
		{
			address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
			name: "DAI",
			decimals: 18,
			divisor: parseUnits("1", 18),
			subsContract: "0x58B05eB0e58761E294297B334869F98983de0169",
		},
		{
			address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
			name: "USDT",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0xcB4f7C087423a0824c3882A955852631BDA6A76e",
		},
		{
			address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
			name: "USDC",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x2f0297A94A6c2CD812432974c8D8a7cCA54f2DE8",
		},
		{
			address: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
			name: "USDC.e",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0xC5B344Cd1685DceeA748EC67a461B6c726CE1E24",
		},
		{
			address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
			name: "DAI",
			decimals: 18,
			divisor: parseUnits("1", 18),
			subsContract: "0x99d25EDB39cEEC96D141C0a24208E3ab088d5b0A",
		},
	],
	[polygon.id]: [
		{
			address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
			name: "USDT",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x04f99d8D93E1884a2Ae96eb4A5ff035C857bACc5",
		},
		{
			address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
			name: "USDC (PoS)",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x1F588F267c785FD484C1396E661CaD27c450938F",
		},
		{
			address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
			name: "USDC",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x0Dd9A31B9e0A34FffBC527beBD3df5821F2857Ff",
		},
		{
			address: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
			name: "DAI",
			decimals: 18,
			divisor: parseUnits("1", 18),
			subsContract: "0x1732b1b7779111663446f8D3D15d381fa1569218",
		},
	],
	[arbitrum.id]: [
		{
			address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
			name: "USDT",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0xF72d86ee2b04e3B280082fcD675480aC5f15C175",
		},
		{
			address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
			name: "USDC",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x48Cc593Bd757CA65a134Eb09D33F8405b8b500bf",
		},
		{
			address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
			name: "USDC.e",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x37971614fdf4E7c6b6F95560978c65010Bb8E93B",
		},
		{
			address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
			name: "DAI",
			decimals: 18,
			divisor: parseUnits("1", 18),
			subsContract: "0xB072D1Ff26bc6529bA441f6D3BE7a211f38f2711",
		},
	],
	[base.id]: [
		{
			address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			name: "USDC",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x4dd39132fa1B6D7fC8fA0D17c7528f20A89B076e",
		},
		{
			address: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",
			name: "USDbC",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x15a86c79665B61a5747563D83aeD3337821a8A79",
		},
	],
	[bsc.id]: [
		{
			address: "0x55d398326f99059ff775485246999027b3197955",
			name: "USDT",
			decimals: 18,
			divisor: parseUnits("1", 18),
			subsContract: "0x04f99d8D93E1884a2Ae96eb4A5ff035C857bACc5",
		},
		{
			address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
			name: "USDC",
			decimals: 18,
			divisor: parseUnits("1", 18),
			subsContract: "0x1F588F267c785FD484C1396E661CaD27c450938F",
		},
	],
	[avalanche.id]: [
		{
			address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
			name: "USDT",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x04f99d8D93E1884a2Ae96eb4A5ff035C857bACc5",
		},
		{
			address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
			name: "USDC",
			decimals: 6,
			divisor: parseUnits("1", 6),
			subsContract: "0x1F588F267c785FD484C1396E661CaD27c450938F",
		},
		{
			address: "0xd586e7f844cea2f87f50152665bcbc2c279d8d70",
			name: "DAI.e",
			decimals: 18,
			divisor: parseUnits("1", 18),
			subsContract: "0x0Dd9A31B9e0A34FffBC527beBD3df5821F2857Ff",
		},
	],
	[blast.id]: [],
};
