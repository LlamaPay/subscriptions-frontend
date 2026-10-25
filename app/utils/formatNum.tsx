export function formatNum(num: string | number | null, fixed: number) {
	if (num === null || num === "") {
		return null;
	}
	const re = new RegExp(`^-?\\d+(?:.\\d{0,${fixed || -1}})?`);
	const final = re.exec(num.toString())?.[0] ?? null;

	return final === null ? null : Number(final).toLocaleString();
}
