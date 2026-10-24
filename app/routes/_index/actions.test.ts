import { decodeFunctionData, erc20Abi } from "viem";
import { beforeEach, expect, test, vi } from "vite-plus/test";

import { approveAndCall } from "./actions";

const mocks = vi.hoisted(() => ({
	sendCalls: vi.fn(() => Promise.resolve({ id: "0xbatch" })),
	waitForCallsStatus: vi.fn(() => Promise.resolve({ status: "success" })),
}));

vi.mock("wagmi/actions", () => ({
	sendCalls: mocks.sendCalls,
	waitForCallsStatus: mocks.waitForCallsStatus,
}));

vi.mock("~/lib/wallet", () => ({ config: {} }));

vi.mock("react-hot-toast", () => ({ toast: { success: () => {}, error: () => {} } }));

const token = "0x1111111111111111111111111111111111111111";
const spender = "0x2222222222222222222222222222222222222222";
const call = "0xdeadbeef";

beforeEach(() => {
	mocks.sendCalls.mockClear();
});

function sentCalls() {
	const [[, parameters]] = mocks.sendCalls.mock.calls as unknown as Array<
		[unknown, { calls: Array<{ to: string; data: `0x${string}` }>; forceAtomic: boolean }]
	>;
	return parameters;
}

test("sends the approval before the call, as one atomic batch", async () => {
	await approveAndCall({ token, chainId: 10, spender, approveAmount: 5n, call });

	const { calls, forceAtomic } = sentCalls();
	expect(forceAtomic).toBe(true);
	expect(calls).toHaveLength(2);
	expect(calls[0].to).toBe(token);
	expect(decodeFunctionData({ abi: erc20Abi, data: calls[0].data })).toEqual({
		functionName: "approve",
		args: [spender, 5n],
	});
	expect(calls[1]).toEqual({ to: spender, data: call });
});

test("skips the approval when the allowance already covers the call", async () => {
	await approveAndCall({ token, chainId: 10, spender, approveAmount: null, call });

	expect(sentCalls().calls).toEqual([{ to: spender, data: call }]);
});

test("reports a failed batch as reverted", async () => {
	mocks.waitForCallsStatus.mockResolvedValueOnce({ status: "failure" });

	await expect(
		approveAndCall({ token, chainId: 10, spender, approveAmount: null, call }),
	).resolves.toEqual({
		status: "reverted",
	});
});
