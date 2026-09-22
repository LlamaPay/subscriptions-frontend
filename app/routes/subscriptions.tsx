import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { getLegacySubsByPair } from "~/lib/legacySubs.server";

import { formatSubs } from "./_index/utils";

export async function loader({ request }: LoaderFunctionArgs) {
	const searchParams = new URL(request.url).searchParams;
	const owner = searchParams.get("owner");
	const receiver = searchParams.get("receiver");

	if (!owner || !receiver) return [];

	try {
		const subs = await getLegacySubsByPair(owner, receiver);
		return json(formatSubs(subs), {
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
