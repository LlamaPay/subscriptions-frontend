import { parseUnits } from "viem";

// Typed amounts can be incomplete ("", ".", "-") or use notation viem rejects ("1e5"), and viem
// 2.55.4+ throws on those. null makes each caller decide what an incomplete amount means.
export function parseAmount(input: string, decimals: number): bigint | null {
	return /^(?:\d+\.?\d*|\.\d+)$/.test(input) ? parseUnits(input, decimals) : null;
}
