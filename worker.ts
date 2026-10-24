import { isAddress } from "viem";

import { fetchLegacySubs } from "./app/lib/legacySubs";
import { formatSubs } from "./app/routes/_index/utils";

// Runs only for paths with no file in build/client. The dashboard is prerendered
// into index.html, so every other page starts from the SPA shell instead.
export default {
	async fetch(request: Request, env: { ASSETS: { fetch: typeof fetch } }) {
		const url = new URL(request.url);

		if (url.pathname === "/subscriptions") {
			return Response.json(await legacySubscriptions(url.searchParams), {
				headers: { "Access-Control-Allow-Origin": "*" },
			});
		}

		// A missing build file, like an old chunk after a deploy, is not a page.
		if (url.pathname.startsWith("/assets/")) {
			return new Response("Not Found", { status: 404 });
		}

		// No extension, because assets redirect `.html` URLs to it.
		return env.ASSETS.fetch(new URL("/__spa-fallback", url));
	},
};

// Other sites (sealed.art) ask whether `owner` pays `receiver` through the legacy
// contracts. The addresses are interpolated into the GraphQL query, so anything
// else gets an empty list, as does a subgraph failure.
async function legacySubscriptions(params: URLSearchParams) {
	const owner = params.get("owner");
	const receiver = params.get("receiver");

	if (owner === null || receiver === null || !isAddress(owner) || !isAddress(receiver)) {
		return [];
	}

	const subs = await fetchLegacySubs(
		`{ and: [{ owner: "${owner.toLowerCase()}" }, { receiver: "${receiver.toLowerCase()}" }] }`,
	).catch(() => []);

	// JSON has no bigint; tokenDivisor goes out as a decimal string.
	return formatSubs(subs).map((sub) => ({ ...sub, tokenDivisor: sub.tokenDivisor?.toString() }));
}
