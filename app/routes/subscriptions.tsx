import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { gql, request as grequest } from "graphql-request";
import { optimism } from "viem/chains";

import { LLAMAPAY_CHAINS_LIB } from "~/lib/constants";
import type { ISub } from "~/types";

import { formatSubs } from "./_index/utils";

export async function loader({ request }: LoaderFunctionArgs) {
	const searchParams = new URL(request.url).searchParams;
	const owner = searchParams.get("owner");
	const receiver = searchParams.get("receiver");

	if (!owner || !receiver) return [];

	try {
		const subs = gql`
    {
        subs(
            where: {
                and: [
                    { owner: "${owner.toLowerCase()}" },
                    { receiver: "${receiver.toLowerCase()}" }
                ]
            }
            orderBy: realExpiration
            orderDirection: desc
        ) {
            id
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
`;
		const data: { subs: Array<ISub> } = await grequest<{ subs: Array<ISub> }>(
			LLAMAPAY_CHAINS_LIB[optimism.id].subgraphs.subscriptions,
			subs,
		).catch(() => ({ subs: [] }));
		return json(formatSubs(data?.subs ?? []), {
			headers: {
				"Access-Control-Allow-Origin": "*",
			},
		});
	} catch (error) {
		throw new Error(
			error instanceof Error ? error.message : "Failed to fetch subscriptions",
		);
	}
}
