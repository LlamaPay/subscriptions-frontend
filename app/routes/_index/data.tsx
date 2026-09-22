import type { INewSub, ISub } from "~/types";

import { readContract } from "wagmi/actions";
import { config, llamapayChainNamesToIds } from "~/lib/wallet";
import { formatNewSubs, formatSubs } from "./utils";

const subStatus = (data: ISub) => {
	return data.startTimestamp === data.realExpiration
		? -1
		: +data.startTimestamp > Date.now() / 1e3
			? 0
			: +data.realExpiration < Date.now() / 1e3
				? -1
				: 1;
};

export async function getSubscriptions(address?: string) {
	try {
		if (!address) return null;

		const [data, newSubs]: [
			{ subs: Array<ISub> },
			{ subscriptions: Array<INewSub> },
		] = await Promise.all([
			fetch(`/legacy-subs?address=${address}`).then((res) => res.json()),
			fetch(`https://api.llamapay.io/subscriptions/owned/${address}`).then(
				(res) => res.json(),
			),
		]);

		const uniqueSubsContracts = new Set<string>();

		for (const sub of newSubs.subscriptions) {
			uniqueSubsContracts.add(
				`${sub.subs_contract}:${llamapayChainNamesToIds[sub.chain]}`,
			);
		}

		const tokenAddresses = await getTokenAddresses(
			Array.from(uniqueSubsContracts),
		);

		const uniqueTokens = Object.entries(tokenAddresses).map(
			([sub, token]) => `${token}:${sub.split(":")[1]}`,
		);

		const tokenDecimals = await getTokenDecimals(uniqueTokens);

		return [
			...formatNewSubs({
				subs: newSubs.subscriptions,
				tokenAddresses,
				tokenDecimals,
			}),
			...formatSubs(data?.subs ?? []),
		].sort((a, b) => subStatus(b) - subStatus(a));
	} catch (error: any) {
		throw new Error(error.message ?? "Failed to fetch subscriptions");
	}
}

const getTokenAddresses = async (contracts: Array<string>) => {
	try {
		const data = await Promise.allSettled(
			contracts.map((contract) =>
				readContract(config, {
					address: contract.split(":")[0] as `0x${string}`,
					abi: [
						{
							inputs: [],
							name: "asset",
							outputs: [
								{ internalType: "contract ERC20", name: "", type: "address" },
							],
							stateMutability: "view",
							type: "function",
						},
					],
					functionName: "asset",
					chainId: +contract.split(":")[1] as any,
				}),
			),
		);

		return Object.fromEntries(
			contracts.map((contract, i) => [
				contract,
				data[i].status === "fulfilled" ? (data[i].value as string) : null,
			]),
		);
	} catch (error) {
		console.log(error);
		return {};
	}
};

const getTokenDecimals = async (contracts: Array<string>) => {
	try {
		const data = await Promise.allSettled(
			contracts.map((contract) =>
				readContract(config, {
					address: contract.split(":")[0] as `0x${string}`,
					abi: [
						{
							inputs: [],
							name: "decimals",
							outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
							stateMutability: "view",
							type: "function",
						},
					],
					functionName: "decimals",
					chainId: +contract.split(":")[1] as any,
				}),
			),
		);

		return Object.fromEntries(
			contracts.map((contract, i) => [
				contract,
				data[i].status === "fulfilled" ? (data[i].value as number) : null,
			]),
		);
	} catch (error) {
		console.log(error);
		return {};
	}
};
