import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { TransactionReceipt } from "viem";
import { beforeEach, expect, test, vi } from "vite-plus/test";

import type { IFormattedSub } from "~/types";

import { ManageSub } from "./ManageSub";

const mocks = vi.hoisted(() => ({
	receiver: "0x1111111111111111111111111111111111111111" as const,
	connected: true,
	pending: false,
	receipt: undefined as Pick<TransactionReceipt, "status"> | undefined,
}));

vi.mock("wagmi", () => ({
	useConnection: () => ({
		address: mocks.receiver,
		chain: mocks.connected ? { id: 10 } : undefined,
	}),
	useReadContract: () => ({ data: 0n, error: null, refetch: () => Promise.resolve() }),
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({
		data: 1_000_000n,
		isLoading: false,
		error: null,
		refetch: () => Promise.resolve(),
	}),
	useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
}));

vi.mock("~/lib/wallet", () => ({ config: {} }));

vi.mock("./actions", () => ({
	useUnsubscribe: () => ({
		data: mocks.receipt,
		mutate: () => {},
		isPending: mocks.pending,
		reset: () => {},
	}),
	useWithdraw: () => ({ mutate: () => {}, isPending: false, error: null }),
	useApproveToken: () => ({ mutate: () => {}, isPending: false, error: null }),
}));

const now = Date.parse("2026-10-21T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;

beforeEach(() => {
	vi.useFakeTimers({ now });
	mocks.connected = true;
	mocks.pending = false;
	mocks.receipt = undefined;
});

function renderSubscription({
	expiresAt = now + 30 * 60 * 1000,
	startedAt = expiresAt - 30 * day,
	unsubscribed = false,
}: { expiresAt?: number; startedAt?: number; unsubscribed?: boolean } = {}) {
	const data: IFormattedSub = {
		type: "new",
		id: "subscription",
		owner: mocks.receiver,
		receiver: mocks.receiver,
		subsContract: mocks.receiver,
		chainId: 10,
		tokenAddress: mocks.receiver,
		tokenDecimal: 6,
		tokenDivisor: 1_000_000n,
		expirationDate: String(expiresAt / 1000),
		realExpiration: String(expiresAt / 1000),
		startTimestamp: String(startedAt / 1000),
		initialPeriod: String(startedAt / 1000),
		initialShares: "0",
		amountPerCycle: "1000000",
		accumulator: "0",
		creationTx: "0x",
		periodDuration: 30 * 24 * 60 * 60,
		fullPeriodStartingTime: 0,
		subDuration: (expiresAt - startedAt) / 1000,
		unsubscribed,
	};

	return renderToStaticMarkup(
		<MemoryRouter>
			<table>
				<tbody>
					<tr>
						<ManageSub data={data} />
					</tr>
				</tbody>
			</table>
		</MemoryRouter>,
	);
}

function unsubscribeButton(html: string) {
	return /<button\b[^>]*>(?:Unsubscribe|Confirming\.\.\.)<\/button>/.exec(html)?.[0];
}

for (const [label, expiresAt, startedAt] of [
	["before the old 43-minute cutoff", now + 60 * 60 * 1000, now - 29 * day],
	["inside the old 43-minute cutoff", now + 30 * 60 * 1000, now - 29 * day],
	["at expiry", now, now - 30 * day],
	["after expiry, to redeem remaining yield", now - day, now - 31 * day],
	["before a delayed subscription starts", now + 60 * day, now + day],
] as const) {
	test(`allow Unsubscribe ${label}`, () => {
		const button = unsubscribeButton(renderSubscription({ expiresAt, startedAt }));
		expect(button).toBeDefined();
		expect(button).not.toMatch(/ disabled=""/);
	});
}

test("disable Unsubscribe while its transaction is pending", () => {
	mocks.pending = true;
	expect(unsubscribeButton(renderSubscription())).toMatch(/ disabled=""/);
});

test("disable Unsubscribe without a connected chain", () => {
	mocks.connected = false;
	expect(unsubscribeButton(renderSubscription())).toMatch(/ disabled=""/);
});

test("hide controls after the backend marks the subscription unsubscribed", () => {
	expect(unsubscribeButton(renderSubscription({ unsubscribed: true }))).toBeUndefined();
});

test("hide controls after a successful unsubscribe receipt", () => {
	mocks.receipt = { status: "success" };
	expect(unsubscribeButton(renderSubscription())).toBeUndefined();
});

test("allow retrying an unsubscribe transaction that reverted", () => {
	mocks.receipt = { status: "reverted" };
	const button = unsubscribeButton(renderSubscription());
	expect(button).toBeDefined();
	expect(button).not.toMatch(/ disabled=""/);
});
