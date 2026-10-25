import { useNow } from "~/hooks/useNow";

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

export function EndsIn({ deadline }: { deadline: number }) {
	const diffTime = Math.abs(useNow(second) - deadline);

	const days = Math.floor(diffTime / day);
	const hours = Math.floor((diffTime % day) / hour);
	const minutes = Math.floor((diffTime % hour) / minute);
	const secs = Math.floor((diffTime % minute) / second);

	return `${days}D ${hours}H ${minutes}m ${secs < 10 ? "0" : ""}${secs}s`;
}
