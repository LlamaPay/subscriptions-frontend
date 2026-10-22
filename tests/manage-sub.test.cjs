const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const source = readFileSync(
	join(__dirname, "../app/routes/_index/ManageSub.tsx"),
	"utf8",
);
const compiled = ts.transpileModule(source, {
	compilerOptions: {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.CommonJS,
		jsx: ts.JsxEmit.ReactJSX,
		esModuleInterop: true,
	},
}).outputText;

const now = Date.parse("2026-10-21T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const receiver = "0x1111111111111111111111111111111111111111";

function renderSubscription({
	expiresAt = now + 30 * 60 * 1000,
	startedAt = expiresAt - 30 * day,
	unsubscribed = false,
	receipt,
	pending = false,
	connected = true,
} = {}) {
	class Clock extends Date {
		static now() {
			return now;
		}
	}
	const dependencies = {
		"@ariakit/react": {
			useDialogStore: () => ({ toggle() {} }),
			Dialog: () => null,
		},
		"@remix-run/react": {
			Link: ({ children }) => React.createElement("a", null, children),
		},
		"@tanstack/react-query": {
			useQuery: () => ({ data: 1000000n, isLoading: false, refetch() {} }),
			useQueryClient: () => ({ invalidateQueries() {} }),
		},
		wagmi: {
			useAccount: () => ({
				address: receiver,
				chain: connected ? { id: 10 } : undefined,
			}),
			useReadContract: () => ({ data: 0n, refetch() {} }),
		},
		"~/components/Icon": { Icon: () => null },
		"~/lib/abi.subscriptions": { SUBSCRIPTIONS_ABI: [] },
		"~/lib/constants": {
			LLAMAPAY_CHAINS_LIB: {},
			SUBSCRIPTION_DURATION: (30 * day) / 1000,
		},
		"~/lib/wallet": { config: {} },
		"~/utils/formatNum": { formatNum: String },
		"./actions": {
			useUnsubscribe: () => ({
				data: receipt,
				mutateAsync() {},
				isPending: pending,
				reset() {},
			}),
			useWithdraw: () => ({ mutateAsync() {} }),
			useApproveToken: () => ({ mutateAsync() {} }),
		},
	};
	const context = vm.createContext({
		Date: Clock,
		exports: {},
		require: (name) =>
			name in dependencies ? dependencies[name] : require(name),
	});
	vm.runInContext(compiled, context);
	const data = {
		type: "new",
		id: "subscription",
		subsContract: receiver,
		receiver,
		chainId: 10,
		tokenAddress: receiver,
		tokenDecimal: 6,
		tokenDivisor: 1000000n,
		realExpiration: String(expiresAt / 1000),
		startTimestamp: String(startedAt / 1000),
		subDuration: (expiresAt - startedAt) / 1000,
		unsubscribed,
	};
	return renderToStaticMarkup(
		React.createElement(
			"table",
			null,
			React.createElement(
				"tbody",
				null,
				React.createElement(
					"tr",
					null,
					React.createElement(context.exports.ManageSub, { data }),
				),
			),
		),
	);
}

function unsubscribeButton(html) {
	return html.match(
		/<button\b[^>]*>(?:Unsubscribe|Confirming\.\.\.)<\/button>/,
	)?.[0];
}

for (const [label, expiresAt, startedAt] of [
	["before the old 43-minute cutoff", now + 60 * 60 * 1000, now - 29 * day],
	["inside the old 43-minute cutoff", now + 30 * 60 * 1000, now - 29 * day],
	["at expiry", now, now - 30 * day],
	["after expiry, to redeem remaining yield", now - day, now - 31 * day],
	["before a delayed subscription starts", now + 60 * day, now + day],
]) {
	test(`allow Unsubscribe ${label}`, () => {
		const button = unsubscribeButton(
			renderSubscription({ expiresAt, startedAt }),
		);
		assert.ok(button);
		assert.doesNotMatch(button, / disabled=""/);
	});
}

test("disable Unsubscribe while its transaction is pending", () => {
	assert.match(
		unsubscribeButton(renderSubscription({ pending: true })),
		/ disabled=""/,
	);
});

test("disable Unsubscribe without a connected chain", () => {
	assert.match(
		unsubscribeButton(renderSubscription({ connected: false })),
		/ disabled=""/,
	);
});

test("hide controls after the backend marks the subscription unsubscribed", () => {
	assert.equal(
		unsubscribeButton(renderSubscription({ unsubscribed: true })),
		undefined,
	);
});

test("hide controls after a successful unsubscribe receipt", () => {
	assert.equal(
		unsubscribeButton(renderSubscription({ receipt: { status: "success" } })),
		undefined,
	);
});

test("allow retrying an unsubscribe transaction that reverted", () => {
	const button = unsubscribeButton(
		renderSubscription({ receipt: { status: "reverted" } }),
	);
	assert.ok(button);
	assert.doesNotMatch(button, / disabled=""/);
});
