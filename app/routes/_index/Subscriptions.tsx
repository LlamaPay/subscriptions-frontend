import { skipToken, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type Address, formatUnits } from "viem";
import { useConnection, useEnsName } from "wagmi";

import incomingImg from "~/assets/icons/incoming.svg";
import outgoingImg from "~/assets/icons/outgoing.svg";
import { EndsIn } from "~/components/EndsIn";
import { Icon } from "~/components/Icon";
import { useHydrated } from "~/hooks/useHydrated";
import { useNow } from "~/hooks/useNow";
import { chainIdToNames } from "~/lib/wallet";
import type { IFormattedSub } from "~/types";

import { getSubscriptions } from "./data";
import { ManageSub } from "./ManageSub";

export function Subscriptions() {
	const { address } = useConnection();

	const {
		data: subs,
		isLoading: fetchingSubs,
		error: errorFetchingSubs,
	} = useQuery({
		queryKey: ["subs", address],
		queryFn: address ? () => getSubscriptions(address) : skipToken,
		refetchInterval: 20_000,
	});

	const hydrated = useHydrated();

	const [snapshotDate, setSnapshotDate] = useState<string>("");

	const downloadActiveSubs = (selectedSnapshotDate: string) => {
		if (subs && selectedSnapshotDate !== "" && address) {
			const snapshotTimestamp = new Date(selectedSnapshotDate).getTime();
			const activeSubs = subs.filter(
				(sub) =>
					+sub.startTimestamp <= snapshotTimestamp / 1e3 &&
					+sub.realExpiration >= snapshotTimestamp / 1e3,
			);
			const rows = [["Address", "Amount per month"]];

			for (const sub of activeSubs) {
				if (sub.receiver === address.toLowerCase()) {
					rows.push([
						sub.owner,
						sub.tokenDecimal === null
							? `${sub.amountPerCycle} not formatted`
							: formatUnits(BigInt(sub.amountPerCycle), sub.tokenDecimal),
					]);
				}
			}

			download(
				`subscriptions-snapshot-${selectedSnapshotDate}.csv`,
				rows.map((r) => r.join(",")).join("\n"),
			);
		}
	};

	return (
		<>
			{!hydrated || fetchingSubs ? (
				<p className="text-center text-sm">Loading...</p>
			) : !address ? (
				<p className="text-center text-sm">Connect wallet to view your subscriptions</p>
			) : errorFetchingSubs || !subs ? (
				<p className="text-center text-sm text-red-500">
					{errorFetchingSubs?.message ?? "Failed to fetch subscriptions"}
				</p>
			) : subs.length === 0 ? (
				<p className="text-center text-sm text-orange-500">You do not have any subscriptions</p>
			) : (
				<>
					{/* Subscribers land here from merchants' "cancel" links, so say what Unsubscribe does before they press it. */}
					{subs.some((sub) => sub.owner.toLowerCase() === address.toLowerCase()) ? (
						<p className="mb-4 text-sm text-[#596575] dark:text-[#838486]">
							To cancel a subscription, click Unsubscribe. It ends the subscription and sends its
							remaining balance back to your wallet. A subscription you don't unsubscribe from ends
							on its own when its paid time runs out.
						</p>
					) : null}
					<table className="w-full border-collapse">
						<thead>
							<tr>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									Type
								</th>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									Address
								</th>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									Tier
								</th>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									Chain
								</th>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									Time Left
								</th>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									Status
								</th>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									Balance
								</th>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									<span className="sr-only">Top up</span>
								</th>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									<span className="sr-only">Withdraw</span>
								</th>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									<span className="sr-only">Unsubscribe</span>
								</th>
								<th className="p-3 text-left font-normal whitespace-nowrap text-[#596575] dark:text-[#838486]">
									Tx
								</th>
							</tr>
						</thead>
						<tbody>
							{subs.map((sub) => (
								<Sub key={sub.creationTx} data={sub} address={address} />
							))}
						</tbody>
					</table>
					<form className="flex flex-wrap items-end gap-4 text-sm">
						<label className="mt-5 flex flex-col gap-1">
							<span>Snapshot</span>
							<input
								type="date"
								name="snapshot"
								value={snapshotDate}
								onChange={(e) => setSnapshotDate(e.target.value)}
								className="rounded-lg border border-black/15 bg-[#ffffff] p-1 dark:border-white/5 dark:bg-[#141414]"
							/>
						</label>
						<button
							type="button"
							className="rounded-lg border border-black/15 bg-[#13785a] p-1 px-2 text-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/5 dark:bg-[#23BF91] dark:text-black"
							onClick={() => downloadActiveSubs(snapshotDate)}
							disabled={snapshotDate === ""}
						>
							Download
						</button>

						<button
							type="button"
							className="rounded-lg border border-black/15 bg-[#13785a] p-1 px-2 text-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/5 dark:bg-[#23BF91] dark:text-black"
							onClick={() => downloadActiveSubs(new Date().toUTCString())}
						>
							Download current snapshot
						</button>
					</form>
				</>
			)}
		</>
	);
}

function Sub({ data, address }: { data: IFormattedSub; address: Address }) {
	const now = useNow(20_000) / 1e3;
	const status =
		data.startTimestamp === data.realExpiration
			? "Cancelled"
			: +data.startTimestamp > now
				? "Not yet started"
				: +data.realExpiration < now
					? "Expired"
					: "Active";

	const incoming = data.receiver === address.toLowerCase();

	const subAddress = incoming ? data.owner : data.receiver;

	const { data: ensName } = useEnsName({ address: subAddress, chainId: 1 });

	return (
		<tr>
			<td className="p-3" title={incoming ? "Incoming" : "Outgoing"}>
				{incoming ? (
					<img src={incomingImg} alt="incoming" />
				) : (
					<img src={outgoingImg} alt="outgoing" />
				)}
			</td>
			<td className="p-3">
				<a
					target="_blank"
					rel="noopene noreferrer"
					href={`${chainIdToNames[data.chainId].blockExplorerUrl}/address/${subAddress}`}
					className="underline"
				>
					{ensName ?? `${subAddress.slice(0, 4)}...${subAddress.slice(-4)}`}
				</a>
			</td>
			<td className="p-3 whitespace-nowrap">
				{data.tokenDecimal === null
					? null
					: `$${formatUnits(BigInt(data.amountPerCycle), data.tokenDecimal)} / month`}
			</td>
			<td title={chainIdToNames[data.chainId].name}>
				<img
					src={`https://icons.llamao.fi/icons/chains/rsz_${chainIdToNames[data.chainId].iconServerName}?w=48&h=48`}
					height={16}
					width={16}
					className="mx-auto rounded-full"
					alt={chainIdToNames[data.chainId].name}
				/>
			</td>
			<td className="p-3">
				{status === "Active" ? (
					<p
						className="whitespace-nowrap tabular-nums"
						title={`Expiry: ${new Date(+data.realExpiration * 1000).toLocaleString()}`}
					>
						<EndsIn deadline={+data.realExpiration * 1000} />
					</p>
				) : (
					"-"
				)}
			</td>
			<td className="p-3 whitespace-nowrap">{status}</td>
			{incoming && data.owner.toLowerCase() !== address.toLowerCase() ? (
				<>
					<td className="p-3 text-center whitespace-nowrap" />
					<td className="p-3 text-center whitespace-nowrap" />
					<td className="p-3 text-center whitespace-nowrap" />
					<td className="p-3 text-center whitespace-nowrap" />
				</>
			) : (
				<ManageSub data={data} />
			)}
			<td className="p-3 text-center whitespace-nowrap">
				<a
					href={`${chainIdToNames[data.chainId].blockExplorerUrl}/tx/${data.creationTx}`}
					target="_blank"
					rel="noreferrer noopener"
				>
					<Icon name="external-link" className="h-4 w-4" />
					<span className="sr-only">link to transaction on chain</span>
				</a>
			</td>
		</tr>
	);
}

function download(filename: string, text: string) {
	const element = document.createElement("a");
	element.setAttribute("href", `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`);
	element.setAttribute("download", filename);

	element.style.display = "none";
	document.body.append(element);

	element.click();

	element.remove();
}
