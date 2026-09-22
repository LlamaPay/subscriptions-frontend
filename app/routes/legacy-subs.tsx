import { type LoaderFunctionArgs, json } from "@remix-run/node";

import {
	getLegacySubsByAddress,
	getLegacySubsByPair,
} from "~/lib/legacySubs.server";

export async function loader({ request }: LoaderFunctionArgs) {
	const searchParams = new URL(request.url).searchParams;
	const address = searchParams.get("address");
	const owner = searchParams.get("owner");
	const receiver = searchParams.get("receiver");

	const subs = address
		? await getLegacySubsByAddress(address)
		: owner && receiver
			? await getLegacySubsByPair(owner, receiver)
			: [];

	return json({ subs });
}
