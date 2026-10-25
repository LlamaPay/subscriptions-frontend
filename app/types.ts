import type { Address } from "viem";

import type { TChain } from "~/lib/wallet";

export interface ISub {
	expirationDate: string;
	id: string;
	initialPeriod: string;
	initialShares: string;
	owner: Address;
	receiver: Address;
	startTimestamp: string;
	unsubscribed: boolean;
	amountPerCycle: string;
	realExpiration: string;
	accumulator: string;
	creationTx: string;
	subsContract: Address;
}

export interface IFormattedSub extends ISub {
	periodDuration: number;
	fullPeriodStartingTime: number;
	subDuration: number;
	chainId: TChain;
	type: "new" | "old";
	tokenAddress: Address | null;
	tokenDecimal: number | null;
	tokenDivisor: bigint | null;
}

export interface INewSub {
	accumulator: string;
	amount_per_cycle: string;
	chain: string;
	creation_tx_hash: string;
	expiration_date: string;
	expires_at: string;
	from_address: Address;
	initial_period: string;
	initial_shares: string;
	started_at: string;
	sub_id: string;
	subs_contract: Address;
	to_address: Address;
	unsubscribed: boolean;
}
