import { gql, request } from "graphql-request";

import type { ISub } from "~/types";

import { LLAMAPAY_CHAINS_LIB } from "./constants";

// Subscriptions on the first Optimism contracts are only in this subgraph. `where` is a
// GraphQL filter object, such as `{ owner: "0x…" }`, with addresses lowercased.
export async function fetchLegacySubs(where: string) {
	const { subs } = await request<{ subs: Array<ISub> }>(
		LLAMAPAY_CHAINS_LIB[10].subgraphs.subscriptions,
		gql`
			{
				subs(where: ${where}, orderBy: realExpiration, orderDirection: desc) {
					id
					owner
					receiver
					startTimestamp
					unsubscribed
					initialShares
					initialPeriod
					expirationDate
					amountPerCycle
					realExpiration
					accumulator
					creationTx
					subsContract
				}
			}
		`,
	);
	return subs;
}
