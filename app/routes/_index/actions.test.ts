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
const batch = { token, chainId: 10, spender, call, onQueued: () => {} } as const;

beforeEach(() => {
	vi.useRealTimers();
	mocks.sendCalls.mockClear();
	mocks.waitForCallsStatus.mockReset();
	mocks.waitForCallsStatus.mockResolvedValue({ status: "success" });
});

function sentCalls() {
	const [[, parameters]] = mocks.sendCalls.mock.calls as unknown as Array<
		[unknown, { calls: Array<{ to: string; data: `0x${string}` }>; forceAtomic: boolean }]
	>;
	return parameters;
}

test("sends the approval before the call, as one atomic batch", async () => {
	await approveAndCall({ ...batch, approveAmount: 5n });

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
	await approveAndCall({ ...batch, approveAmount: null });

	expect(sentCalls().calls).toEqual([{ to: spender, data: call }]);
});

test("reports a failed batch as reverted", async () => {
	mocks.waitForCallsStatus.mockResolvedValueOnce({ status: "failure" });

	await expect(approveAndCall({ ...batch, approveAmount: null })).resolves.toEqual({
		status: "reverted",
	});
});

// A Safe that cannot find a batch it has just proposed makes the status lookup fail. The
// batch can still run, so this must not settle as an error that unlocks the form.
test("keeps an accepted batch queued through failed lookups until it runs", async () => {
	vi.useFakeTimers();
	mocks.waitForCallsStatus
		.mockRejectedValueOnce(new Error("Unknown bundle id"))
		.mockRejectedValueOnce(new Error("Unknown bundle id"))
		.mockResolvedValueOnce({ status: "success" });
	const onQueued = vi.fn<() => void>();

	let settled = false;
	const result = approveAndCall({ ...batch, approveAmount: null, onQueued }).finally(() => {
		settled = true;
	});

	await vi.advanceTimersByTimeAsync(15_000);
	expect(onQueued).toHaveBeenCalled();
	expect(settled).toBe(false);

	await vi.advanceTimersByTimeAsync(15_000);
	await expect(result).resolves.toEqual({ status: "success" });
	expect(mocks.sendCalls).toHaveBeenCalledTimes(1);
});
