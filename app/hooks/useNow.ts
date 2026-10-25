import { useEffect, useState } from "react";

// The current time in milliseconds, read again every intervalMs, so components can
// compare against the clock without reading it during render.
export function useNow(intervalMs: number) {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), intervalMs);

		return () => clearInterval(id);
	}, [intervalMs]);

	return now;
}
