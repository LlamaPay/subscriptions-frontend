import { parseUnits } from "viem";
import {
	DAI_OPTIMISM,
	SUBSCRIPTION_DURATION,
	SUBSCRIPTION_PERIOD,
} from "~/lib/constants";
import { llamapayChainNamesToIds } from "~/lib/wallet";
import type { IFormattedSub, INewSub, ISub } from "~/types";

export const formatSubs = (data: Array<ISub>) => {
	return data.map((sub) => {
		const startTimestamp = +sub.startTimestamp;
		const initialPeriod = +sub.initialPeriod;
		const realExpiration = +sub.realExpiration;
		const fullPeriodStartingTime = initialPeriod + SUBSCRIPTION_DURATION;
		const partialPeriodTime = fullPeriodStartingTime - startTimestamp;
		const fullCycles =
			(realExpiration - fullPeriodStartingTime) / SUBSCRIPTION_DURATION;

		const partialCycles = partialPeriodTime / SUBSCRIPTION_DURATION;
		const totalCycles = fullCycles + partialCycles;

		const totalDays = totalCycles * SUBSCRIPTION_PERIOD;
		// const remainingSeconds = (remainingMinutes - minutes) * secondsInMinute
		// const seconds = Math.floor(remainingSeconds)

		return {
			...sub,
			periodDuration: SUBSCRIPTION_DURATION,
			fullPeriodStartingTime,
			subDuration: totalDays * 24 * 60 * 60,
			chainId: 10,
			type: "old",
			tokenAddress: DAI_OPTIMISM.address,
			tokenDecimal: DAI_OPTIMISM.decimals,
			tokenDivisor: parseUnits("1", DAI_OPTIMISM.decimals),
		} as IFormattedSub;
	});
};

export const formatNewSubs = ({
	subs,
	tokenAddresses,
	tokenDecimals,
}: {
	subs: Array<INewSub>;
	tokenAddresses: Record<string, string | null>;
	tokenDecimals: Record<string, number | null>;
}) => {
	return subs.map((sub) => {
		const startTimestamp = +sub.started_at;
		const initialPeriod = +sub.initial_period;
		const realExpiration = +sub.expires_at;
		const fullPeriodStartingTime = initialPeriod + SUBSCRIPTION_DURATION;
		const partialPeriodTime = fullPeriodStartingTime - startTimestamp;
		const fullCycles =
			(realExpiration - fullPeriodStartingTime) / SUBSCRIPTION_DURATION;

		const partialCycles = partialPeriodTime / SUBSCRIPTION_DURATION;
		const totalCycles = fullCycles + partialCycles;

		const totalDays = totalCycles * SUBSCRIPTION_PERIOD;
		// const remainingSeconds = (remainingMinutes - minutes) * secondsInMinute
		// const seconds = Math.floor(remainingSeconds)

		const chainId = llamapayChainNamesToIds[sub.chain];
		const tokenAddress =
			tokenAddresses[`${sub.subs_contract}:${chainId}`] ?? null;
		const tokenDecimal = tokenAddress
			? (tokenDecimals[`${tokenAddress}:${chainId}`] ?? null)
			: null;

		return {
			expirationDate: sub.expiration_date,
			id: sub.sub_id,
			initialPeriod: sub.initial_period,
			initialShares: sub.initial_shares,
			owner: sub.from_address,
			receiver: sub.to_address,
			startTimestamp: sub.started_at,
			unsubscribed: sub.unsubscribed,
			amountPerCycle: sub.amount_per_cycle,
			realExpiration: sub.expires_at,
			accumulator: sub.accumulator,
			creationTx: sub.creation_tx_hash,
			subsContract: sub.subs_contract,
			periodDuration: SUBSCRIPTION_DURATION,
			fullPeriodStartingTime,
			subDuration: totalDays * 24 * 60 * 60,
			chainId,
			type: "new",
			tokenAddress,
			tokenDecimal,
			tokenDivisor: tokenDecimal ? parseUnits("1", tokenDecimal) : null,
		} as IFormattedSub;
	});
};
