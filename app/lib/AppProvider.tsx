import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
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
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</WagmiProvider>
	);
}
