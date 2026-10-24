import * as Ariakit from "@ariakit/react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Await, Link } from "react-router";
import {
	type Address,
	encodeFunctionData,
	erc20Abi,
	formatUnits,
	getAddress,
	isAddress,
} from "viem";
import { optimism } from "viem/chains";
import { useConnection, useEnsName, useReadContract, useSwitchChain } from "wagmi";

import { EndsIn } from "~/components/EndsIn";
import { Icon } from "~/components/Icon";
import { useHydrated } from "~/hooks/useHydrated";
import { useNow } from "~/hooks/useNow";
import { SUBSCRIPTIONS_ABI } from "~/lib/abi.subscriptions";
import { DAI_OPTIMISM, LLAMAPAY_CHAINS_LIB, SUBSCRIPTION_DURATION } from "~/lib/constants";
import { fetchLegacySubs } from "~/lib/legacySubs";
import { formatNum } from "~/utils/formatNum";
import { parseAmount } from "~/utils/parseAmount";

import { useApproveToken } from "../_index/actions";
import { calculateSubBalance } from "../_index/data";
import { formatSubs } from "../_index/utils";
import type { Route } from "./+types/route";
import { useExtendSubscription, useSubscribe } from "./actions";

const AccountMenu = lazy(() =>
	import("~/components/Header/AccountMenu").then((module) => ({
		default: module.AccountMenu,
	})),
);
const ConnectWallet = lazy(() =>
	import("~/components/ConnectWallet").then((module) => ({
		default: module.ConnectWallet,
	})),
);

declare module "react" {
	// The page paints in the merchant's brand colors through these CSS variables.
	interface CSSProperties {
		"--page-bg-color"?: string;
		"--page-text-color"?: string;
		"--page-bg-color-2"?: string;
		"--page-text-color-2"?: string;
	}
}

// Merchants build these links with the receiver, the DAI amount per month and
// optionally their brand color, so a link that lacks them is not a page.
export function clientLoader({ request }: Route.ClientLoaderArgs) {
	const searchParams = new URL(request.url).searchParams;
	const to = searchParams.get("to");
	const amount = searchParams.get("amount");
	const brandColor = searchParams.get("brandColor");
	const closeAfterPayment = searchParams.get("closeAfterPayment");
	const amountPerCycle = amount === null ? null : parseAmount(amount, DAI_OPTIMISM.decimals);

	if (
		to === null ||
		!isAddress(to) ||
		amount === null ||
		amountPerCycle === null ||
		amountPerCycle === 0n
	) {
		throw new Response("Not Found", { status: 404 });
	}

	// Not awaited, so the page renders before the receiver's verified Twitter account loads.
	const verification = fetch(`https://verify.sealed.art/verification/${to}`)
		.then((res) => res.json() as Promise<{ twitterUsername?: string } | null>)
		.catch(() => null);

	const bgColor = brandColor ?? "#23BF91";
	const textColor = getTextColor(bgColor);
	const bgColor2 =
		bgColor === "#ffffff"
			? "#000000"
			: bgColor === "#000000"
				? "#ffffff"
				: textColor === "#ffffff"
					? "#000000"
					: "#ffffff";
	const textColor2 = bgColor2 === "#ffffff" ? "#000000" : "#ffffff";

	return {
		to: getAddress(to),
		amount,
		amountPerCycle,
		bgColor,
		textColor,
		bgColor2,
		textColor2,
		verification,
		closeAfterPayment: closeAfterPayment === "true",
	};
}

const AAVE_YIELD = 0.052;

export default function Subscribe({ loaderData }: Route.ComponentProps) {
	const { address, isConnected, chain } = useConnection();
	const { mutate: switchChain } = useSwitchChain();
	const hydrated = useHydrated();

	// get current subscriptions of user where user is already subscribed to receiver on same/different tier
	const {
		data: subs,
		isLoading: fetchingSubs,
		error: errorFetchingSubs,
		refetch: refetchSubs,
	} = useQuery({
		queryKey: ["subs", address, loaderData.to],
		queryFn: address ? () => getSubscriptions(address, loaderData.to) : skipToken,
		refetchInterval: 20_000,
	});

	// The newest running subscription from this owner to the receiver, if any.
	const currentSub = subs?.at(0);
	const isUserAlreadyASubscriber = currentSub !== undefined;
	const isUserSubscribedToSameTier =
		currentSub?.amountPerCycle === loaderData.amountPerCycle.toString();
	const amountPerMonth = Number(loaderData.amount);

	// backward compatible with old contract
	const subsContract =
		currentSub?.subsContract ?? LLAMAPAY_CHAINS_LIB[optimism.id].contracts.subscriptions;

	// get current DAI balance of user
	const {
		data: balance,
		isLoading: fetchingBalance,
		error: errorFetchingBalance,
		refetch: refetchBalance,
	} = useReadContract({
		address: DAI_OPTIMISM.address,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: address && [address],
		chainId: optimism.id,
		query: { enabled: address !== undefined },
	});

	const formRef = useRef<HTMLFormElement>(null);

	const [amountToDepositNotDebounced, setAmountToDeposit] = useState("");
	const amountToDeposit = useDebounce(amountToDepositNotDebounced);
	// An empty or half-typed amount counts as 0.
	const depositAmount = parseAmount(amountToDeposit, DAI_OPTIMISM.decimals) ?? 0n;
	const depositAmountNotDebounced =
		parseAmount(amountToDepositNotDebounced, DAI_OPTIMISM.decimals) ?? 0n;
	const balanceLeft = currentSub?.balanceLeft ?? 0n;
	const amountToDepositActually = balanceLeft + depositAmount;

	// get current DAI allowance of user
	const {
		data: allowance,
		error: errorFetchingAllowance,
		refetch: refetchAllowance,
	} = useReadContract({
		address: DAI_OPTIMISM.address,
		abi: erc20Abi,
		functionName: "allowance",
		args: address && [address, subsContract],
		chainId: optimism.id,
		query: {
			enabled: address !== undefined,
		},
	});
	// get current period from contract
	const {
		data: currentPeriod,
		isLoading: fetchingCurrentPeriod,
		error: errorFetchingCurrentPeriod,
		refetch: refetchCurrentPeriod,
	} = useReadContract({
		address: subsContract,
		abi: SUBSCRIPTIONS_ABI,
		functionName: "currentPeriod",
		chainId: optimism.id,
	});

	// check if input amount is gte to allowance
	const isApproved =
		allowance !== undefined && amountToDeposit.length > 0
			? allowance >= amountToDepositActually
			: false;
	const {
		mutate: approveToken,
		isPending: confirmingTokenApproval,
		error: errorConfirmingTokenApproval,
	} = useApproveToken();

	const {
		data: subscribeTxDataOnChain,
		mutate: subscribe,
		isPending: confirmingSubscription,
		error: errorConfirmingSubscription,
	} = useSubscribe();
	const {
		data: waitingForSubscriptionTxDataOnChain,
		mutate: subscriptionExtend,
		isPending: confirmingSubscriptionExtension,
		error: errorConfirmingSubscriptionExtension,
	} = useExtendSubscription();

	// amount per cycle from url query params
	const decimalsAmountPerCycle = loaderData.amountPerCycle;
	// duration of current period where user cannot claim money deposited
	const now = useNow(1000);
	const currentTime = BigInt(Math.floor(now / 1e3));

	// calculate time left in current cycle
	let timeLeftInCurrentCycle = 0n;
	if (currentPeriod !== undefined) {
		timeLeftInCurrentCycle = currentPeriod + BigInt(SUBSCRIPTION_DURATION) - currentTime;
		while (timeLeftInCurrentCycle < 0) {
			timeLeftInCurrentCycle += BigInt(SUBSCRIPTION_DURATION);
		}
	}
	const newCost = decimalsAmountPerCycle;
	// cost of subscription if user is already a subscriber
	const oldCost = currentSub ? BigInt(currentSub.amountPerCycle) : 0n;
	// if user is updtaing their subscription tier, calculate amount to be paid instantly
	let instantPayment =
		isUserAlreadyASubscriber && newCost > oldCost
			? ((newCost - oldCost) * timeLeftInCurrentCycle) / BigInt(SUBSCRIPTION_DURATION)
			: 0n;

	const currentSubNotStarted = currentSub !== undefined && +currentSub.startTimestamp > now / 1e3;

	let amountForCurrentPeriod = 0n;
	if (currentPeriod !== undefined) {
		if (isUserAlreadyASubscriber) {
			// if users current subscription hasn't started , instant payment should be 0
			if (currentSubNotStarted) {
				instantPayment = 0n;
				amountForCurrentPeriod = 0n;
			} else {
				amountForCurrentPeriod = instantPayment;
			}
		} else {
			amountForCurrentPeriod =
				(decimalsAmountPerCycle * timeLeftInCurrentCycle) / BigInt(SUBSCRIPTION_DURATION);
		}
	}

	const onSubscribed = (receipt: { status: "success" | "reverted" }) => {
		if (receipt.status === "success") {
			formRef.current?.reset();

			void refetchBalance();
			void refetchAllowance();
			void refetchCurrentPeriod();
			void refetchSubs();
			// A merchant that opened this page in a popup waits for this message.
			if (loaderData.closeAfterPayment) {
				(window.opener as Window | null)?.postMessage("payment_success", "*");
				window.close();
			}
		}
	};

	const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		// if user is an existing subscriber , use batch to call unsubscribe() and subscribeForNextPeriod() to extend the current subscription
		if (currentSub) {
			const subscribeForNextPeriod = encodeFunctionData({
				abi: SUBSCRIPTIONS_ABI,
				functionName: "subscribeForNextPeriod",
				args: [loaderData.to, decimalsAmountPerCycle, amountToDepositActually, instantPayment],
			});
			const calls = currentSub.unsubscribed
				? [subscribeForNextPeriod]
				: [
						encodeFunctionData({
							abi: SUBSCRIPTIONS_ABI,
							functionName: "unsubscribe",
							args: [
								BigInt(currentSub.initialPeriod),
								BigInt(currentSub.expirationDate),
								BigInt(currentSub.amountPerCycle),
								currentSub.receiver,
								BigInt(currentSub.accumulator),
								BigInt(currentSub.initialShares),
							],
						}),
						subscribeForNextPeriod,
					];
			subscriptionExtend({ subsContract, calls }, { onSuccess: onSubscribed });
		} else {
			subscribe(
				{
					subsContract,
					receiver: loaderData.to,
					amountPerCycle: decimalsAmountPerCycle,
					amountForFuture: depositAmount - amountForCurrentPeriod,
				},
				{ onSuccess: onSubscribed },
			);
		}
	};
	// amount that cannot be claimed once subscribed
	const amountChargedInstantly = formatUnits(amountForCurrentPeriod, DAI_OPTIMISM.decimals);
	// amount is only valid if its gte to amount charged instantly
	const isValidInputAmount =
		currentPeriod === undefined
			? +amountToDeposit >= amountPerMonth
			: depositAmount + balanceLeft >= amountForCurrentPeriod;
	const isValidInputAmountNotDebounced =
		currentPeriod === undefined
			? +amountToDepositNotDebounced >= amountPerMonth
			: depositAmountNotDebounced + balanceLeft >= amountForCurrentPeriod;

	const disableAll =
		!hydrated ||
		!address ||
		chain?.id !== optimism.id ||
		confirmingTokenApproval ||
		confirmingSubscription ||
		confirmingSubscriptionExtension ||
		fetchingSubs ||
		amountToDeposit.length === 0;
	const disableApprove = disableAll || isApproved;
	const disableSubscribe =
		disableAll ||
		!isValidInputAmountNotDebounced ||
		!isApproved ||
		balance === undefined ||
		balance < depositAmount ||
		currentPeriod === undefined ||
		fetchingCurrentPeriod;

	const { data: ensName } = useEnsName({ address: loaderData.to, chainId: 1 });

	// durattion of current period where user cannot claim money deposited
	const currentPeriodEndsIn = Number(currentTime + timeLeftInCurrentCycle) * 1e3;
	// if user is an existing subscriber, include claimable balance in current subscription
	const amountAfterDepositing = +formatUnits(balanceLeft, DAI_OPTIMISM.decimals) + +amountToDeposit;
	// subtract amount charged instantly from claimable amount
	const claimableAmount = +formatUnits(
		balanceLeft + depositAmount - amountForCurrentPeriod,
		DAI_OPTIMISM.decimals,
	);

	// montly yield is based only on claimable amount
	const monthlyYield = (claimableAmount * AAVE_YIELD) / 12;
	// net cost per month for user
	const netCostPerMonth = monthlyYield - amountPerMonth;
	const netCostFuture = currentPeriod === undefined ? null : amountPerMonth - monthlyYield;
	// expected subscription duration after depositing; 0 when it cannot be estimated
	const expectedMonthsFuture =
		netCostFuture === null || netCostFuture === 0 ? 0 : Math.floor(claimableAmount / netCostFuture);
	const expectedYears = Math.trunc(expectedMonthsFuture / 12);
	const expectedMonths = expectedMonthsFuture % 12;
	const expectedDuration =
		expectedMonthsFuture === 0
			? null
			: `${expectedYears > 0 ? `${expectedYears} ${expectedYears > 1 ? "Years" : "Year"}, ` : ""}${expectedMonths} ${expectedMonths > 1 ? "Months" : "Month"}`;

	const borderColor = loaderData.textColor === "#ffffff" ? "border-white/40" : "border-black/40";
	const hideTableColumns =
		!hydrated || amountToDeposit.length === 0 || !isValidInputAmount || currentPeriod === undefined;

	return (
		<main
			style={{
				"--page-bg-color": loaderData.bgColor,
				"--page-text-color": loaderData.textColor,
				"--page-bg-color-2": loaderData.bgColor2,
				"--page-text-color-2": loaderData.textColor2,
			}}
			className="relative col-span-full row-span-full flex flex-col lg:bg-[linear-gradient(to_right,var(--page-bg-color)_50%,var(--page-bg-color-2)_50%)]"
		>
			{hydrated ? (
				<>
					{!isConnected ? (
						<Suspense
							fallback={
								<button
									type="button"
									className="absolute top-4 right-4 rounded-lg border p-2 text-(--page-text-color) lg:border-(--page-bg-color) lg:text-(--page-text-color-2)"
									disabled
								>
									Connect Wallet
								</button>
							}
						>
							<ConnectWallet className="absolute top-4 right-4 rounded-lg border p-2 text-(--page-text-color) lg:border-(--page-bg-color) lg:text-(--page-text-color-2)" />
						</Suspense>
					) : (
						<div className="absolute top-4 right-4 flex items-center gap-4">
							<Suspense fallback={<p />}>
								<AccountMenu className="absolute top-4 right-4 rounded-lg border p-2 text-(--page-text-color) lg:border-(--page-bg-color) lg:text-(--page-text-color-2)" />
							</Suspense>
						</div>
					)}
				</>
			) : null}

			<div className="flex flex-1 flex-col lg:my-auto lg:flex-none lg:flex-row">
				<div className="flex-1 bg-(--page-bg-color) text-(--page-text-color)">
					<div className="mx-auto flex max-w-[650px] flex-col px-4 pt-24 pb-9 lg:ml-auto lg:px-[100px]">
						<button
							type="button"
							onClick={goBack}
							className="absolute top-4 flex items-center gap-1"
						>
							<Icon name="arrow-left-sm" className="h-6 w-6 shrink-0" />
							<span className="sr-only">Navigate back</span>
						</button>
						<h1 className="flex flex-wrap items-center gap-1 text-lg font-medium text-(--page-text-color) opacity-[0.85]">
							<span>Subscribe to</span>
							<span className="flex flex-nowrap gap-2">
								<a
									target="_blank"
									rel="noreferrer noopener"
									href={`https://optimistic.etherscan.io/address/${loaderData.to}`}
									className="underline"
									suppressHydrationWarning
								>
									{ensName ?? `${loaderData.to.slice(0, 6)}...${loaderData.to.slice(-6)}`}
								</a>
								<Suspense fallback={<p />}>
									<Await resolve={loaderData.verification} errorElement={<p />}>
										{(verification) => (
											<>
												{verification?.twitterUsername ? (
													<a
														href={`https://twitter.com/${verification.twitterUsername}`}
														target="_blank"
														rel="noreferrer noopener"
														className="flex items-center"
													>
														<Icon name="twitter" className="relative -bottom-px h-4 w-4" />
													</a>
												) : null}
											</>
										)}
									</Await>
								</Suspense>
							</span>
						</h1>
						<p className="mt-1 mr-auto text-4xl font-semibold">
							<span className="flex items-center justify-center gap-1">
								<img src={DAI_OPTIMISM.img} width={36} height={36} alt="" />
								<span>{`${formatNum(amountPerMonth, 2)} DAI`}</span>
								<span className="mt-auto mb-[2px] text-base font-normal opacity-[0.85]">
									/ month
								</span>
							</span>
						</p>
						<Link to="/" className="mt-10 flex items-center gap-1 text-sm underline opacity-[0.85]">
							<Icon name="cog" className="h-4 w-4 shrink-0" />
							<span className="">Manage your subscriptions</span>
						</Link>
						{hydrated && currentPeriod !== undefined ? (
							<ul className="mt-10 ml-4 hidden list-disc flex-col gap-2 text-sm text-(--page-text-color) opacity-90 lg:flex">
								{isUserAlreadyASubscriber ? (
									<>
										<li className="list-disc">You are an existing subscriber</li>
										{isUserSubscribedToSameTier ? null : (
											<li className="list-disc">
												You are updating your subscription tier from{" "}
												{formatUnits(oldCost, DAI_OPTIMISM.decimals)} DAI to {loaderData.amount} DAI
												per month
											</li>
										)}
									</>
								) : null}
								<li className="list-disc">
									Current period ends in{" "}
									<span className="tabular-nums">
										<EndsIn deadline={currentPeriodEndsIn} />
									</span>
								</li>
								<li className="list-disc">{`You'll be charged ${formatNum(
									+amountChargedInstantly,
									2,
								)} DAI instantly`}</li>
								<li className="list-disc">
									After {getShortTimeFromDeadline(currentPeriodEndsIn)}{" "}
									{`you'll be charged ${formatNum(amountPerMonth, 2)} DAI, repeated every 30 days`}
								</li>
								<li className="list-disc">You can withdraw balance left at any time</li>
							</ul>
						) : null}
					</div>
				</div>
				<div className="flex-1 bg-(--page-bg-color-2) text-(--page-text-color-2) lg:overflow-auto">
					<div className="mx-auto flex max-w-[650px] flex-col gap-5 overflow-auto px-4 pt-9 pb-9 lg:mr-auto lg:px-[100px] lg:pt-24">
						<form className="flex flex-col gap-4" onSubmit={handleSubmit} ref={formRef}>
							<label className="flex flex-col gap-1">
								<span>Amount to deposit</span>

								<span
									className={`relative isolate rounded-lg border ${
										loaderData.textColor2 === "#000000"
											? "border-black/30 bg-black/8"
											: "border-white/30 bg-white/8"
									} p-3 pb-[26px] outline-offset-2 focus-within:outline-solid`}
								>
									<input
										name="amountToDeposit"
										className="relative z-10 w-full border-none bg-transparent pr-16 text-4xl outline-hidden!"
										required
										autoComplete="off"
										autoCorrect="off"
										type="text"
										pattern="^[0-9]*[.,]?[0-9]*$"
										placeholder="0.0"
										minLength={1}
										maxLength={79}
										spellCheck="false"
										inputMode="decimal"
										title="Enter numbers only."
										value={amountToDepositNotDebounced}
										onChange={(e) => {
											if (!Number.isNaN(Number(e.target.value))) {
												setAmountToDeposit(e.target.value.trim());
											}
										}}
										disabled={confirmingSubscription || confirmingSubscriptionExtension}
									/>
									<span className="absolute top-3 right-4 bottom-0 my-auto flex flex-col gap-2">
										<p className="ml-auto flex items-center gap-1 text-xl">
											<img src={DAI_OPTIMISM.img} width={16} height={16} alt="" />
											<span>DAI</span>
										</p>
										<p className="flex items-center gap-1 text-xs">
											<span>Balance:</span>
											{!hydrated || fetchingBalance ? (
												<span className="inline-block h-4 w-8 animate-pulse rounded-sm bg-gray-400" />
											) : !isConnected || errorFetchingBalance ? (
												<span>-</span>
											) : (
												<>
													<span>
														{formatNum(
															balance === undefined
																? null
																: +formatUnits(balance, DAI_OPTIMISM.decimals),
															2,
														) ?? "0"}
													</span>

													<button
														type="button"
														className="text-(--page-text-color-2) underline"
														onClick={() =>
															setAmountToDeposit(formatUnits(balance ?? 0n, DAI_OPTIMISM.decimals))
														}
													>
														Max
													</button>
												</>
											)}
										</p>
									</span>
								</span>
							</label>

							<p className="flex items-center gap-1 text-sm">
								<span>Net Cost:</span>
								{!hydrated || amountToDeposit.length <= 0 || !isValidInputAmount ? (
									""
								) : netCostFuture !== null && netCostFuture < 0 ? (
									<>
										<span>Free</span>
										<Ariakit.TooltipProvider showTimeout={0}>
											<Ariakit.TooltipAnchor
												render={<Icon name="question-mark-circle" className="h-5 w-5" />}
											/>
											<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
												{`This assumes current yield (${AAVE_YIELD}% APR on your deposits) doesn't go down`}
											</Ariakit.Tooltip>
										</Ariakit.TooltipProvider>
									</>
								) : (
									<>
										<img src={DAI_OPTIMISM.img} width={14} height={14} alt="" />
										<span>{`${formatNum(netCostFuture, 2) ?? 0} DAI per month`}</span>
										<Ariakit.TooltipProvider showTimeout={0}>
											<Ariakit.TooltipAnchor
												render={<Icon name="question-mark-circle" className="h-5 w-5" />}
											/>
											<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
												You will earn 5% APR on your deposits
											</Ariakit.Tooltip>
										</Ariakit.TooltipProvider>
									</>
								)}
							</p>
							{!hydrated || amountToDeposit.length <= 0 || !isValidInputAmount ? (
								<p className="flex items-center gap-1 text-sm" suppressHydrationWarning>
									Subscription Ends In:
								</p>
							) : expectedMonthsFuture < 0 ? (
								<p className="flex items-center gap-1 text-sm">
									<span>Subscription Months: Infinite</span>
									<Ariakit.TooltipProvider showTimeout={0}>
										<Ariakit.TooltipAnchor
											render={<Icon name="question-mark-circle" className="h-5 w-5" />}
										/>
										<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
											{`This assumes current yield (5% APR on your deposits) doesn't go down`}
										</Ariakit.Tooltip>
									</Ariakit.TooltipProvider>
								</p>
							) : isUserAlreadyASubscriber ? (
								isUserSubscribedToSameTier ? (
									<p className="flex flex-wrap items-center gap-1 text-sm" suppressHydrationWarning>
										Subscription Duration: Extended by{" "}
										{Math.trunc(+amountToDeposit / amountPerMonth)}{" "}
										{+amountToDeposit / amountPerMonth >= 2 ? "months" : "month"}
									</p>
								) : (
									<>
										{currentSubNotStarted ? (
											expectedDuration ? (
												<p
													className="flex flex-wrap items-center gap-1 text-sm"
													suppressHydrationWarning
												>
													Subscription Duration: {expectedDuration}
												</p>
											) : (
												<p
													className="flex flex-wrap items-center gap-1 text-sm"
													suppressHydrationWarning
												>
													Subscription Duration: Extended by{" "}
													{Math.trunc(+amountToDeposit / amountPerMonth)}{" "}
													{+amountToDeposit / amountPerMonth >= 2 ? "months" : "month"}
												</p>
											)
										) : (
											<p
												className="flex flex-wrap items-center gap-1 text-sm"
												suppressHydrationWarning
											>
												Subscription Ends In:{" "}
												{expectedDuration ? <span>{`${expectedDuration}, `}</span> : null}
												{amountToDeposit.length > 0 ? (
													<span className="tabular-nums">
														<EndsIn deadline={currentPeriodEndsIn} />
													</span>
												) : null}
											</p>
										)}
									</>
								)
							) : (
								<p className="flex flex-wrap items-center gap-1 text-sm" suppressHydrationWarning>
									Subscription Ends In:{" "}
									{expectedDuration ? <span>{`${expectedDuration}, `}</span> : null}
									{amountToDeposit.length > 0 ? (
										<span className="tabular-nums">
											<EndsIn deadline={currentPeriodEndsIn} />
										</span>
									) : null}
								</p>
							)}

							{!hydrated ? null : !isConnected || !chain ? (
								<Suspense
									fallback={
										<button
											type="button"
											className="flex-1 rounded-lg bg-(--page-bg-color) p-3 text-(--page-text-color) disabled:opacity-60"
											disabled
										>
											Connect Wallet
										</button>
									}
								>
									<ConnectWallet className="flex-1 rounded-lg bg-(--page-bg-color) p-3 text-(--page-text-color) disabled:opacity-60" />
								</Suspense>
							) : subscribeTxDataOnChain?.status === "success" ? (
								<button
									type="button"
									disabled
									className="flex-1 rounded-lg border border-(--page-bg-color) bg-(--page-bg-color) p-3 text-(--page-text-color) disabled:bg-(--page-bg-color-2) disabled:text-(--page-text-color-2) disabled:opacity-60"
								>
									Subscribed!
								</button>
							) : chain.id !== optimism.id ? (
								<button
									type="button"
									onClick={() => switchChain({ chainId: optimism.id })}
									className="flex-1 rounded-lg bg-(--page-bg-color) p-3 text-(--page-text-color) disabled:opacity-60"
								>
									Switch Network
								</button>
							) : (
								<div className="flex flex-nowrap gap-4">
									<div className="flex flex-col justify-between gap-1 lg:-ml-12">
										<div
											className="h-8 w-8 rounded-full border-2 border-(--page-text-color-2) bg-(--page-text-color-2) first-of-type:mt-3 data-[disabled=true]:bg-(--page-bg-color-2) data-[disabled=true]:opacity-40"
											data-disabled={
												confirmingTokenApproval ||
												isApproved ||
												confirmingSubscription ||
												confirmingSubscriptionExtension ||
												amountToDeposit.length === 0
											}
										/>
										<div className="mx-auto min-h-[4px] w-[2px] flex-1 bg-(--page-text-color-2) opacity-40" />
										<div
											className="mb-3 h-8 w-8 rounded-full border-2 border-(--page-text-color-2) bg-(--page-text-color-2) data-[disabled=true]:bg-(--page-bg-color-2) data-[disabled=true]:opacity-40"
											data-disabled={
												!isApproved ||
												confirmingSubscription ||
												confirmingTokenApproval ||
												confirmingSubscriptionExtension ||
												amountToDeposit.length === 0 ||
												disableSubscribe
											}
										/>
									</div>
									<div className="flex flex-1 flex-col gap-6">
										<button
											className="flex-1 rounded-lg border border-(--page-bg-color) bg-(--page-bg-color) p-3 text-(--page-text-color) disabled:bg-(--page-bg-color-2) disabled:text-(--page-text-color-2) disabled:opacity-60"
											disabled={disableApprove}
											type="button"
											onClick={() => {
												approveToken(
													{
														token: DAI_OPTIMISM.address,
														chainId: optimism.id,
														spender: subsContract,
														amount: amountToDepositActually,
													},
													{
														onSuccess: (receipt) => {
															if (receipt.status === "success") {
																void refetchAllowance();
																void refetchCurrentPeriod();
															}
														},
													},
												);
											}}
										>
											{confirmingTokenApproval
												? "Confirming..."
												: isApproved
													? "Approved"
													: "Approve"}
										</button>

										<button
											className="flex-1 rounded-lg border border-(--page-bg-color) bg-(--page-bg-color) p-3 text-(--page-text-color) disabled:bg-(--page-bg-color-2) disabled:text-(--page-text-color-2) disabled:opacity-60"
											disabled={disableSubscribe}
											type="submit"
										>
											{confirmingSubscription ||
											confirmingSubscriptionExtension ||
											waitingForSubscriptionTxDataOnChain
												? "Confirming..."
												: "Subscribe"}
										</button>
									</div>
								</div>
							)}

							{currentPeriod !== undefined &&
							!isValidInputAmountNotDebounced &&
							amountToDepositNotDebounced.length > 0 ? (
								<p className="text-center text-sm break-all text-red-500">
									Amount less than cost for the current period
								</p>
							) : null}

							{hydrated && errorConfirmingTokenApproval ? (
								<p className="text-center text-sm break-all text-red-500">
									{errorConfirmingTokenApproval.message}
								</p>
							) : null}

							{hydrated &&
							errorConfirmingSubscription &&
							!(
								errorConfirmingSubscription.message.includes("hash") &&
								errorConfirmingSubscription.message.includes("could not be found")
							) ? (
								<p className="text-center text-sm break-all text-red-500">
									{errorConfirmingSubscription.message}
								</p>
							) : null}

							{hydrated &&
							errorConfirmingSubscriptionExtension &&
							!(
								errorConfirmingSubscriptionExtension.message.includes("hash") &&
								errorConfirmingSubscriptionExtension.message.includes("could not be found")
							) ? (
								<p className="text-center text-sm break-all text-red-500">
									{errorConfirmingSubscriptionExtension.message}
								</p>
							) : null}

							{hydrated && errorFetchingAllowance ? (
								<p className="text-center text-sm break-all text-red-500">
									{errorFetchingAllowance.shortMessage}
								</p>
							) : null}

							{hydrated && isConnected && errorFetchingCurrentPeriod ? (
								<p className="text-center text-sm break-all text-red-500">
									{errorFetchingCurrentPeriod.shortMessage}
								</p>
							) : null}

							{hydrated && isConnected && errorFetchingSubs ? (
								<p className="text-center text-sm break-all text-red-500">
									{`Failed to fetch if you are a current subscriber - ${errorFetchingSubs.message}`}
								</p>
							) : null}

							{subscribeTxDataOnChain ? (
								subscribeTxDataOnChain.status === "success" ? (
									<p className="text-center text-sm break-all text-green-500">
										Transaction Success
									</p>
								) : (
									<p className="text-center text-sm break-all text-red-500">Transaction Failed</p>
								)
							) : null}
						</form>

						{hydrated && currentPeriod !== undefined ? (
							<ul className="mt-10 ml-4 flex list-disc flex-col gap-2 text-sm text-(--page-text-color) opacity-90 lg:hidden">
								{isUserAlreadyASubscriber ? (
									<>
										<li className="list-disc">You are an existing subscriber</li>
										{isUserSubscribedToSameTier ? null : (
											<li className="list-disc">
												You are updating your subscription tier from{" "}
												{formatUnits(oldCost, DAI_OPTIMISM.decimals)} DAI to {loaderData.amount} DAI
												per month
											</li>
										)}
									</>
								) : null}
								<li className="list-disc">
									Current period ends in{" "}
									<span className="tabular-nums">
										<EndsIn deadline={currentPeriodEndsIn} />
									</span>
								</li>
								<li className="list-disc">{`You'll be charged ${formatNum(
									+amountChargedInstantly,
									2,
								)} DAI instantly`}</li>
								<li className="list-disc">
									After {getShortTimeFromDeadline(currentPeriodEndsIn)}{" "}
									{`you'll be charged ${formatNum(amountPerMonth, 2)} DAI, repeated every 30 days`}
								</li>
								<li className="list-disc">You can withdraw balance left at any time</li>
							</ul>
						) : null}

						<div className="overflow-x-auto">
							<table className="mt-10 min-w-full border-collapse opacity-[0.85]">
								<tbody>
									<tr className={`border-b ${borderColor}`}>
										<th className="p-2 pr-6 text-left text-sm font-normal whitespace-nowrap">
											Your Deposit
										</th>
										{hideTableColumns ? (
											<td className="p-2 pl-6 text-sm whitespace-nowrap opacity-80">
												Input Amount
											</td>
										) : (
											<td className="p-2 pl-6 text-sm whitespace-nowrap">
												<span className="flex flex-nowrap items-center gap-1">
													<span className="whitespace-nowrap">
														{formatNum(amountAfterDepositing, 2)} DAI
													</span>{" "}
													{balanceLeft === 0n ? null : (
														<Ariakit.TooltipProvider showTimeout={0}>
															<Ariakit.TooltipAnchor
																render={<Icon name="question-mark-circle" className="h-5 w-5" />}
															/>
															<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
																{`Includes remaining balance from current subscription (${formatUnits(
																	balanceLeft,
																	DAI_OPTIMISM.decimals,
																)} DAI)`}
															</Ariakit.Tooltip>
														</Ariakit.TooltipProvider>
													)}
												</span>
											</td>
										)}
									</tr>
									{isUserAlreadyASubscriber ? null : (
										<tr className={`border-b ${borderColor}`}>
											<th className="p-2 pr-6 text-left text-sm font-normal whitespace-nowrap">
												After Instant Payment
											</th>
											{hideTableColumns ? (
												<td className="p-2 pl-6 text-sm whitespace-nowrap" />
											) : (
												<td className="p-2 pl-6 text-sm whitespace-nowrap">
													{formatNum(claimableAmount, 2)} DAI
												</td>
											)}
										</tr>
									)}
									<tr className={`border-b ${borderColor}`}>
										<th className="p-2 pr-6 text-left text-sm font-normal whitespace-nowrap">
											<span className="flex flex-nowrap items-center gap-1">
												AAVE Yield
												<Ariakit.TooltipProvider showTimeout={0}>
													<Ariakit.TooltipAnchor
														render={<Icon name="question-mark-circle" className="h-5 w-5" />}
													/>
													<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
														Average APY over the last 30 days
													</Ariakit.Tooltip>
												</Ariakit.TooltipProvider>
											</span>
										</th>
										{hideTableColumns ? (
											<td className="p-2 pl-6 text-sm whitespace-nowrap" />
										) : (
											<td className="p-2 pl-6 text-sm whitespace-nowrap">{`${
												AAVE_YIELD * 100
											}%`}</td>
										)}
									</tr>
									<tr className={`border-b ${borderColor}`}>
										<th className="p-2 pr-6 text-left text-sm font-normal whitespace-nowrap">
											Monthly Yield
										</th>
										{hideTableColumns ? (
											<td className="p-2 pl-6 text-sm whitespace-nowrap" />
										) : (
											<td className="p-2 pl-6 text-sm whitespace-nowrap">
												{monthlyYield < 0 ? "" : "+"}
												{formatNum(monthlyYield, 2)} DAI
											</td>
										)}
									</tr>
									<tr className={`border-b ${borderColor}`}>
										<th className="p-2 pr-6 text-left text-sm font-normal whitespace-nowrap">
											Subscription
										</th>
										{hideTableColumns ? (
											<td className="p-2 pl-6 text-sm whitespace-nowrap" />
										) : (
											<td className="p-2 pl-6 text-sm whitespace-nowrap">
												-{loaderData.amount} DAI
											</td>
										)}
									</tr>
									<tr className={`border-b ${borderColor}`}>
										<th className="p-2 pr-6 text-left text-sm font-normal whitespace-nowrap">
											Net Cost
										</th>
										{hideTableColumns ? (
											<td className="p-2 pl-6 text-sm whitespace-nowrap" />
										) : (
											<td className="p-2 pl-6 text-sm whitespace-nowrap">
												{netCostPerMonth < 0 ? "" : "+"}
												{formatNum(netCostPerMonth, 2)} DAI
											</td>
										)}
									</tr>
									<tr className={`border-b ${borderColor}`}>
										<th className="p-2 pr-6 text-left text-sm font-normal whitespace-nowrap">
											Duration
										</th>
										{hideTableColumns ? (
											<td className="p-2 pl-6 text-sm whitespace-nowrap" />
										) : isUserAlreadyASubscriber ? (
											<td className="p-2 pl-6 text-sm whitespace-nowrap">
												{expectedDuration ??
													`Extended by ${Math.trunc(+amountToDeposit / amountPerMonth)} ${
														+amountToDeposit / amountPerMonth >= 2 ? "months" : "month"
													}`}
											</td>
										) : (
											<td className="p-2 pl-6 text-sm whitespace-nowrap">
												{expectedDuration === null ? "" : `${expectedDuration}, `}
												{amountToDeposit.length > 0 ? (
													<span className="tabular-nums">
														<EndsIn deadline={currentPeriodEndsIn} />
													</span>
												) : null}
											</td>
										)}
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}

function hexToRgb(hex: string) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result
		? {
				r: Number.parseInt(result[1], 16),
				g: Number.parseInt(result[2], 16),
				b: Number.parseInt(result[3], 16),
			}
		: null;
}

function rgbToRgb(rgb: string) {
	const result = rgb.match(/[0-9.]+/gi);

	return result ? { r: +result[0], g: +result[1], b: +result[2] } : null;
}

function getTextColor(color: string) {
	const rgb = color.startsWith("#")
		? hexToRgb(color)
		: color.startsWith("rgb")
			? rgbToRgb(color)
			: null;

	if (!rgb) {
		return "black";
	}

	const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
	return luminance < 140 ? "#ffffff" : "#000000";
}

const getShortTimeFromDeadline = (deadline: number) => {
	const diffTime = Math.abs(Date.now() - new Date(deadline).valueOf());
	let days = diffTime / (24 * 60 * 60 * 1000);
	let hours = (days % 1) * 24;
	let minutes = (hours % 1) * 60;
	let secs = (minutes % 1) * 60;
	[days, hours, minutes, secs] = [
		Math.floor(days),
		Math.floor(hours),
		Math.floor(minutes),
		Math.floor(secs),
	];

	if (days) {
		return `${days} days`;
	}

	if (hours) {
		return `${hours} hours`;
	}

	if (minutes) {
		return `${minutes} minutes`;
	}

	return `${secs} seconds`;
};

// Merchants open this page from their own site, so Back returns there. With no
// page to go back to, it goes to the dashboard after a second.
function goBack(e: React.MouseEvent) {
	e.preventDefault();

	const oldHash = window.location.hash;

	history.back();

	if (window.location.hash === oldHash && document.referrer === "") {
		window.setTimeout(() => {
			window.location.href = "https://subscriptions.llamapay.io";
		}, 1000);
	}
}

function useDebounce<T>(value: T): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedValue(value), 500);

		return () => {
			clearTimeout(timer);
		};
	}, [value]);

	return debouncedValue;
}

async function getSubscriptions(owner: Address, receiver: Address) {
	const subs = await fetchLegacySubs(
		`{ and: [{ owner: "${owner.toLowerCase()}" }, { receiver: "${receiver.toLowerCase()}" }] }`,
	).catch(() => []);

	const now = Date.now() / 1e3;
	const formattedSubs = formatSubs(
		subs.filter((s) => +s.realExpiration > now && +s.startTimestamp !== +s.realExpiration),
	);

	const balances = await Promise.allSettled(
		formattedSubs.map((sub) => calculateSubBalance(sub, 10n ** BigInt(DAI_OPTIMISM.decimals))),
	);

	return formattedSubs.map((sub, index) => {
		const balance = balances[index];
		return { ...sub, balanceLeft: balance.status === "fulfilled" ? balance.value : 0n };
	});
}
