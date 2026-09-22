import { decodeEventLog, parseAbi, toEventSelector } from "viem";

import { SUBSCRIPTION_DURATION } from "~/lib/constants";
import type { ISub } from "~/types";

const OPTIMISM_CHAIN_ID = 10;
const LEGACY_SUBS_CONTRACTS = [
	"0x8b6473801e466e543baf0cb6c7ea1c9321c3c816",
	"0x58b05eb0e58761e294297b334869f98983de0169",
];
const LEGACY_SUBS_START_BLOCK = 109815574;
const PERIOD_START_SECONDS = 1704067200;
const CACHE_TTL_MS = 30e3;
const PAGE_SIZE = 1000;

const EVENTS = [
	"event NewSubscription(address owner, uint256 initialPeriod, uint256 expirationDate, uint256 amountPerCycle, address receiver, uint256 accumulator, uint256 initialShares, bytes32 subId)",
	"event NewDelayedSubscription(address owner, uint256 initialPeriod, uint256 expirationDate, uint256 amountPerCycle, address receiver, uint256 accumulator, uint256 initialShares, bytes32 subId, uint256 instantPayment)",
	"event Unsubscribe(bytes32 subId)",
] as const;
const abi = parseAbi(EVENTS);
const topics = EVENTS.map((signature) => toEventSelector(signature));

interface IndexerLog {
	block_number: number;
	log_index: number;
	timestamp: string;
	transaction_hash: string;
	source: string;
	topic0: `0x${string}`;
	data: `0x${string}`;
}

async function fetchLogs(topic0: string) {
	const baseUrl = process.env.LLAMA_INDEXER_URL;
	const apiKey = process.env.LLAMA_INDEXER_API_KEY;
	if (!baseUrl || !apiKey) {
		throw new Error("LLAMA_INDEXER_URL and LLAMA_INDEXER_API_KEY are required");
	}
	const logs: IndexerLog[] = [];
	let offset = 0;
	while (true) {
		const url = new URL(`${baseUrl.replace(/\/+$/, "")}/logs`);
		url.searchParams.set("chainId", String(OPTIMISM_CHAIN_ID));
		url.searchParams.set("addresses", LEGACY_SUBS_CONTRACTS.join(","));
		url.searchParams.set("topic0", topic0);
		url.searchParams.set("from_block", String(LEGACY_SUBS_START_BLOCK));
		url.searchParams.set("to_block", String(Number.MAX_SAFE_INTEGER));
		url.searchParams.set("limit", String(PAGE_SIZE));
		url.searchParams.set("offset", String(offset));
		const response = await fetch(url, { headers: { "x-api-key": apiKey } });
		if (!response.ok) {
			throw new Error(`llama indexer returned ${response.status}`);
		}
		const page: { totalCount: number; logs: IndexerLog[] } =
			await response.json();
		logs.push(...page.logs);
		offset += page.logs.length;
		if (offset >= page.totalCount || page.logs.length === 0) {
			return logs;
		}
	}
}

function endOfCurrentPeriod(timestamp: number) {
	const cycles = Math.floor(
		(timestamp - PERIOD_START_SECONDS - 1) / SUBSCRIPTION_DURATION,
	);
	return PERIOD_START_SECONDS + (cycles + 1) * SUBSCRIPTION_DURATION;
}

function foldLogs(logs: IndexerLog[]): ISub[] {
	logs.sort(
		(a, b) => a.block_number - b.block_number || a.log_index - b.log_index,
	);
	const subs: ISub[] = [];
	const byId = new Map<string, ISub>();
	for (const log of logs) {
		const parsed = decodeEventLog({
			abi,
			data: log.data,
			topics: [log.topic0],
		});
		if (!parsed.args) continue;
		const timestamp = Math.floor(
			new Date(`${log.timestamp.replace(" ", "T")}Z`).getTime() / 1e3,
		);
		const contract = log.source.toLowerCase();
		if (parsed.eventName === "Unsubscribe") {
			const sub = byId.get(`${contract}:${parsed.args.subId}`);
			if (!sub) continue;
			sub.realExpiration = String(
				Math.min(endOfCurrentPeriod(timestamp), Number(sub.realExpiration)),
			);
			sub.unsubscribed = true;
			continue;
		}
		const args = parsed.args;
		const instantPayment =
			parsed.eventName === "NewDelayedSubscription"
				? parsed.args.instantPayment
				: null;
		const owner = args.owner.toLowerCase();
		const receiver = args.receiver.toLowerCase();
		let startTimestamp = timestamp;
		if (instantPayment !== null) {
			const periodEnd = endOfCurrentPeriod(timestamp);
			startTimestamp = periodEnd;
			const previous = subs
				.filter(
					(sub) =>
						sub.subsContract === contract &&
						sub.owner === owner &&
						sub.receiver === receiver &&
						Number(sub.realExpiration) === periodEnd &&
						Number(sub.startTimestamp) < timestamp,
				)
				.reduce<ISub | null>(
					(max, sub) =>
						max === null ||
						BigInt(sub.amountPerCycle) > BigInt(max.amountPerCycle)
							? sub
							: max,
					null,
				);
			if (
				previous !== null &&
				args.amountPerCycle > BigInt(previous.amountPerCycle)
			) {
				const subCutoff = Math.max(Number(previous.startTimestamp), timestamp);
				const fractionOfCycleLeft =
					(periodEnd - subCutoff) / SUBSCRIPTION_DURATION;
				const extraCredit =
					fractionOfCycleLeft * Number(previous.amountPerCycle) +
					Number(instantPayment);
				const extraTime =
					(SUBSCRIPTION_DURATION * extraCredit) / Number(args.amountPerCycle);
				startTimestamp = Math.floor(periodEnd - extraTime);
				previous.realExpiration = String(startTimestamp);
				previous.unsubscribed = true;
			}
		}
		const sub: ISub = {
			id: args.subId,
			subsContract: contract,
			owner,
			receiver,
			initialPeriod: String(args.initialPeriod),
			expirationDate: String(args.expirationDate),
			amountPerCycle: String(args.amountPerCycle),
			accumulator: String(args.accumulator),
			initialShares: String(args.initialShares),
			startTimestamp: String(startTimestamp),
			realExpiration: String(
				Number(args.expirationDate) + SUBSCRIPTION_DURATION,
			),
			unsubscribed: false,
			creationTx: log.transaction_hash,
		};
		subs.push(sub);
		byId.set(`${contract}:${sub.id}`, sub);
	}
	return subs;
}

let cache: { fetchedAt: number; subs: Promise<ISub[]> } | null = null;

export function getLegacySubs() {
	if (cache === null || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
		const subs = Promise.all(topics.map(fetchLogs)).then((pages) =>
			foldLogs(pages.flat()),
		);
		cache = { fetchedAt: Date.now(), subs };
		subs.catch(() => {
			cache = null;
		});
	}
	return cache.subs;
}

const byExpiration = (a: ISub, b: ISub) =>
	Number(b.realExpiration) - Number(a.realExpiration);

export async function getLegacySubsByAddress(address: string) {
	const lower = address.toLowerCase();
	return (await getLegacySubs())
		.filter((sub) => sub.owner === lower || sub.receiver === lower)
		.sort(byExpiration);
}

export async function getLegacySubsByPair(owner: string, receiver: string) {
	const lowerOwner = owner.toLowerCase();
	const lowerReceiver = receiver.toLowerCase();
	return (await getLegacySubs())
		.filter((sub) => sub.owner === lowerOwner && sub.receiver === lowerReceiver)
		.sort(byExpiration);
}
