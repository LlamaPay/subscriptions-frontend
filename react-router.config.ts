import type { Config } from "@react-router/dev/config";

export default {
	// SPA mode: the build is static files on Workers static assets, so routes use
	// clientLoader and nothing renders on a server.
	ssr: false,
	// The dashboard is rendered at build time so it paints before the JS loads.
	// /subscribe reads search params, so it renders in the browser.
	prerender: ["/"],
} satisfies Config;
