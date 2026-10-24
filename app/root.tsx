// The npm buffer polyfill, not Node's built-in: this module also runs in the browser.
// oxlint-disable-next-line unicorn/prefer-node-protocol
import { Buffer } from "buffer";

import type { ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import {
	Links,
	Meta,
	type MetaFunction,
	Outlet,
	Scripts,
	ScrollRestoration,
	isRouteErrorResponse,
} from "react-router";

import "./app.css";
import type { Route } from "./+types/root";
import interFont from "./assets/fonts/InterVariable.woff2";
import { AppProvider } from "./lib/AppProvider";
import { ColorSchemeScript } from "./utils/color-scheme/ColorSchemeScript";
import { useResolvedColorScheme } from "./utils/color-scheme/components";

// `@coinbase-wallet/sdk` uses `Buffer`
// @types/node declares a global Buffer, but browsers have none until this assignment.
// oxlint-disable-next-line typescript/no-unnecessary-condition
if (typeof document !== "undefined" && window.Buffer === undefined) {
	window.Buffer = Buffer;
}

export const meta: MetaFunction = () => {
	return [
		{ title: "LlamaPay" },
		{
			name: "description",
			content:
				"LlamaPay is a multi-chain protocol that allows you to automate transactions and stream them by the second. The recipients can withdraw these funds at any time. This eliminates the need for manual transactions.",
		},
	];
};

export const links: Route.LinksFunction = () => [
	{ rel: "preload", as: "font", type: "font/woff2", crossOrigin: "anonymous", href: interFont },
];

// Wraps the app, the error page and the loading page. The build renders it around
// the dashboard into index.html, and around HydrateFallback into __spa-fallback.html.
export function Layout({ children }: { children: ReactNode }) {
	const colorScheme = useResolvedColorScheme();

	return (
		// Hydration renders the build-time class (none) while ColorSchemeScript may already have
		// added `dark`; React keeps the DOM class, then sets the stored scheme right after.
		<html lang="en" className={colorScheme === "dark" ? "dark" : ""} suppressHydrationWarning>
			<head>
				<ColorSchemeScript />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
				<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
				<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
				<link rel="manifest" href="/manifest.json" />
				<Meta />
				<Links />
			</head>
			<body>
				<AppProvider>{children}</AppProvider>
				<Toaster position="top-right" />
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

// The first paint of /subscribe, built before any URL is known. It has no header,
// because /subscribe is the only page that is not prerendered and it shows none.
export function HydrateFallback() {
	return (
		<main className="col-span-full row-span-full flex items-center justify-center">
			<p className="text-sm">Loading...</p>
		</main>
	);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404" : "Error";
		details =
			error.status === 404 ? "The requested page could not be found." : error.statusText || details;
	} else if (import.meta.env.DEV && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="col-span-full flex w-full flex-col p-4 pt-16">
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre className="w-full overflow-x-auto p-4">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
