import { expect, test, vi } from "vite-plus/test";

import type { IFormattedSub } from "~/types";

import { calculateSubBalance } from "./data";

const mocks = vi.hoisted(() => ({
	convertToAssets: vi.fn((shares: bigint) => shares),
}));

// One full period is paid at a share price that leaves a remainder: 3 * 1e6 / 2e6 = 1.5 shares.
vi.mock("wagmi/actions", () => ({
	readContract: (
		_config: unknown,
		{ functionName, args }: { functionName: string; args?: Array<bigint> },
	) => {
		switch (functionName) {
			case "sharesAccumulator": {
				return Promise.resolve(3n);
			}
			case "currentPeriod": {
				return Promise.resolve(BigInt(Math.floor(Date.now() / 1e3)));
			}
			case "convertToAssets": {
				return Promise.resolve(mocks.convertToAssets(args?.[0] ?? 0n));
			}
			default: {
				return Promise.reject(new Error(`unexpected read: ${functionName}`));
			}
		}
	},
	multicall: () => Promise.resolve([]),
}));

vi.mock("~/lib/wallet", () => ({ config: {}, llamapayChainNamesToIds: {} }));

const owner = "0x1111111111111111111111111111111111111111";

test("rounds the shares already paid up, as Subs.sol's unsubscribe does", async () => {
	const sub: IFormattedSub = {
		type: "new",
		id: "subscription",
		owner,
		receiver: owner,
		subsContract: owner,
		chainId: 10,
		tokenAddress: owner,
		tokenDecimal: 6,
		tokenDivisor: 2_000_000n,
		expirationDate: String(Math.floor(Date.now() / 1e3) + 86_400),
		realExpiration: "0",
		startTimestamp: "0",
		initialPeriod: "0",
		initialShares: "10",
		amountPerCycle: "1000000",
		accumulator: "0",
		creationTx: "0x",
		periodDuration: 0,
		fullPeriodStartingTime: 0,
		subDuration: 0,
		unsubscribed: false,
	};

	// 10 shares minus 1.5 rounded up to 2, not down to 1.
	await expect(calculateSubBalance(sub, 2_000_000n)).resolves.toBe(8n);
});
