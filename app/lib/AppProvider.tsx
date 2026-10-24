import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { WagmiProvider, useConnect, useConnection, useConnectors } from "wagmi";
import { hashFn } from "wagmi/query";

import { config } from "./wallet";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			queryKeyHashFn: hashFn,
		},
	},
});

export function AppProvider({ children }: { children: ReactNode }) {
	return (
		<WagmiProvider config={config}>
			<QueryClientProvider client={queryClient}>
				<SafeAutoConnect />
				{children}
			</QueryClientProvider>
		</WagmiProvider>
	);
}

// Inside the Safe{Wallet} iframe the connected Safe must be the active account,
// even when another wallet is remembered. The Safe connector only has a provider
// in that iframe: elsewhere it returns none, or rejects in another site's iframe,
// so the site itself never connects it.
function SafeAutoConnect() {
	const { connector } = useConnection();
	const { mutate: connect, isPending } = useConnect();
	const connectors = useConnectors();

	useEffect(() => {
		if (isPending || connector?.name === "Safe") {
			return;
		}

		const safeConnector = connectors.find((cntr) => cntr.name === "Safe");

		if (!safeConnector) {
			return;
		}

		safeConnector
			.getProvider()
			.then((provider) => {
				// The Safe connector resolves undefined outside the Safe{Wallet} iframe.
				if (provider !== undefined) {
					connect({ connector: safeConnector });
				}
			})
			.catch(() => {});
	}, [connect, connector?.name, connectors, isPending]);

	return null;
}
