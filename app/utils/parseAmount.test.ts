import { expect, test } from "vite-plus/test";

import { parseAmount } from "./parseAmount";

test("returns null for anything but a complete non-negative decimal", () => {
	for (const input of ["", ".", "-", "-1", "1e5", " 1", "1,5"]) {
		expect(parseAmount(input, 18)).toBe(null);
	}
});

test("parses complete amounts with the token's decimals", () => {
	expect(parseAmount("1", 6)).toBe(1_000_000n);
	expect(parseAmount("1.", 6)).toBe(1_000_000n);
	expect(parseAmount(".5", 6)).toBe(500_000n);
	expect(parseAmount("1.5", 18)).toBe(1_500_000_000_000_000_000n);
	expect(parseAmount("0", 18)).toBe(0n);
	// Fractions beyond the token's decimals round to the nearest unit.
	expect(parseAmount("1.0000005", 6)).toBe(1_000_001n);
});
