import type { Address } from "viem";

import { DAI_OPTIMISM, SUBSCRIPTION_DURATION, SUBSCRIPTION_PERIOD } from "~/lib/constants";
import type { TChain } from "~/lib/wallet";
import type { IFormattedSub, INewSub, ISub } from "~/types";

export function formatSubs(data: Array<ISub>): Array<IFormattedSub> {
	return data.map((sub) => {
		const startTimestamp = +sub.startTimestamp;
		const initialPeriod = +sub.initialPeriod;
		const realExpiration = +sub.realExpiration;
		const fullPeriodStartingTime = initialPeriod + SUBSCRIPTION_DURATION;
		const partialPeriodTime = fullPeriodStartingTime - startTimestamp;
		const fullCycles = (realExpiration - fullPeriodStartingTime) / SUBSCRIPTION_DURATION;

		const partialCycles = partialPeriodTime / SUBSCRIPTION_DURATION;
		const totalCycles = fullCycles + partialCycles;

		const totalDays = totalCycles * SUBSCRIPTION_PERIOD;

		return {
			...sub,
			periodDuration: SUBSCRIPTION_DURATION,
			fullPeriodStartingTime,
			subDuration: totalDays * 24 * 60 * 60,
			chainId: 10,
			type: "old",
			tokenAddress: DAI_OPTIMISM.address,
			tokenDecimal: DAI_OPTIMISM.decimals,
			tokenDivisor: 10n ** BigInt(DAI_OPTIMISM.decimals),
		};
	});
}

export function formatNewSubs({
	subs,
	tokenAddresses,
	tokenDecimals,
}: {
	subs: Array<INewSub & { chainId: TChain }>;
	tokenAddresses: Map<string, Address | null>;
	tokenDecimals: Map<string, number | null>;
}): Array<IFormattedSub> {
	return subs.map((sub) => {
		const startTimestamp = +sub.started_at;
		const initialPeriod = +sub.initial_period;
		const realExpiration = +sub.expires_at;
		const fullPeriodStartingTime = initialPeriod + SUBSCRIPTION_DURATION;
		const partialPeriodTime = fullPeriodStartingTime - startTimestamp;
		const fullCycles = (realExpiration - fullPeriodStartingTime) / SUBSCRIPTION_DURATION;

		const partialCycles = partialPeriodTime / SUBSCRIPTION_DURATION;
		const totalCycles = fullCycles + partialCycles;

		const totalDays = totalCycles * SUBSCRIPTION_PERIOD;

		const tokenAddress = tokenAddresses.get(`${sub.subs_contract}:${sub.chainId}`) ?? null;
		const tokenDecimal =
			tokenAddress === null ? null : (tokenDecimals.get(`${tokenAddress}:${sub.chainId}`) ?? null);

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
			chainId: sub.chainId,
			type: "new",
			tokenAddress,
			tokenDecimal,
			tokenDivisor: tokenDecimal === null ? null : 10n ** BigInt(tokenDecimal),
		};
	});
}
