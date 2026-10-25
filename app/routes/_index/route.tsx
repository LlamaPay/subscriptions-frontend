import * as Ariakit from "@ariakit/react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { formatUnits } from "viem";
import { useConnection } from "wagmi";

import incomingImg from "~/assets/icons/incoming.svg";
import outgoingImg from "~/assets/icons/outgoing.svg";
import { useHydrated } from "~/hooks/useHydrated";
import { useNow } from "~/hooks/useNow";

import { getSubscriptions } from "./data";

const defaultSelectedId = "subscriptions";

const Claim = lazy(() => import("./Claim").then((module) => ({ default: module.Claim })));
const Subscriptions = lazy(() =>
	import("./Subscriptions").then((module) => ({
		default: module.Subscriptions,
	})),
);

export default function Index() {
	const hydrated = useHydrated();
	const { address, isConnected } = useConnection();

	const { data: subs } = useQuery({
		queryKey: ["subs", address],
		queryFn: address ? () => getSubscriptions(address) : skipToken,
		refetchInterval: 20_000,
	});

	let totalEarnings = 0;
	let totalExpenditure = 0;
	const now = useNow(20_000) / 1e3;
	if (subs && address) {
		for (const sub of subs) {
			const active = +sub.startTimestamp <= now && +sub.realExpiration >= now;
			if (active && sub.tokenDecimal !== null) {
				const amount = +formatUnits(BigInt(sub.amountPerCycle), sub.tokenDecimal);
				if (sub.receiver === address.toLowerCase()) {
					totalEarnings += amount;
				} else {
					totalExpenditure += amount;
				}
			}
		}
	}

	return (
		<main className="relative isolate flex flex-col gap-5 overflow-x-hidden px-4 py-9 md:pr-8">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
				<div className="flex flex-col gap-1 rounded-lg border border-black/5 bg-[#FCFFFE] p-3 text-sm shadow-[0px_1px_0px_0px_rgba(0,0,0,0.05)] dark:border-white/5 dark:bg-[#1a1a1a]">
					<p className="flex items-center gap-1">
						<img src={incomingImg} alt="incoming" />
						<span>Earnings : </span>
						{hydrated && isConnected && subs ? (
							<span className="whitespace-nowrap">
								<strong>${totalEarnings}</strong> / month
							</span>
						) : null}
					</p>
					<p className="flex items-center gap-1">
						<img src={outgoingImg} alt="incoming" />
						<span>Expenses : </span>
						{hydrated && isConnected && subs ? (
							<span className="whitespace-nowrap">
								<strong>${totalExpenditure}</strong> / month
							</span>
						) : null}
					</p>
				</div>
			</div>
			<div className="rounded-lg border border-black/5 bg-[#FCFFFE] shadow-[0px_1px_0px_0px_rgba(0,0,0,0.05)] dark:border-white/5 dark:bg-[#1a1a1a]">
				<Ariakit.TabProvider defaultSelectedId={defaultSelectedId}>
					<Ariakit.TabList
						className="flex flex-wrap items-center gap-6 p-5 pb-0"
						aria-label="Mange Subscriptions"
					>
						<Ariakit.Tab
							className="group flex flex-nowrap items-center gap-1 border-b border-b-transparent pb-3 text-sm font-medium data-active-item:border-b-[#13785a] data-active-item:text-[#13785a] dark:data-active-item:border-b-[#21B58A] dark:data-active-item:text-[#21B58A]"
							id="subscriptions"
						>
							<span>Subscriptions</span>
							{/* <span className="rounded-full bg-[#F5F5F5] p-1 group-data-active-item:bg-[#E0FFF6] dark:bg-[#3b3b3b] dark:group-data-active-item:bg-[#323a37]">
								0
							</span> */}
						</Ariakit.Tab>
						<Ariakit.Tab
							className="group flex flex-nowrap items-center gap-1 border-b border-b-transparent pb-3 text-sm font-medium data-active-item:border-b-[#13785a] data-active-item:text-[#13785a] dark:data-active-item:border-b-[#21B58A] dark:data-active-item:text-[#21B58A]"
							id="claim"
						>
							<span>Claim</span>
						</Ariakit.Tab>
					</Ariakit.TabList>
					<Ariakit.TabPanel
						className="mt-1 w-full overflow-x-auto p-5 md:max-w-[calc(100vw-204px-32px-4px)]"
						tabId="subscriptions"
					>
						<Suspense fallback={<p />}>
							{hydrated ? <Subscriptions /> : <p className="text-center text-sm">Loading...</p>}
						</Suspense>
					</Ariakit.TabPanel>
					<Ariakit.TabPanel
						className="mt-1 w-full overflow-x-auto p-5 md:max-w-[calc(100vw-204px-32px-4px)]"
						tabId="claim"
					>
						<Suspense fallback={<p />}>
							{hydrated ? <Claim /> : <p className="text-center text-sm">Loading...</p>}
						</Suspense>
					</Ariakit.TabPanel>
				</Ariakit.TabProvider>
			</div>
		</main>
	);
}
