import * as Ariakit from "@ariakit/react";
import { type LoaderFunctionArgs, defer } from "@remix-run/node";
import { Await, Link, useLoaderData } from "@remix-run/react";
import { useQuery } from "@tanstack/react-query";
import {
	type CSSProperties,
	Suspense,
	lazy,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	encodeFunctionData,
	erc20Abi,
	formatUnits,
	getAddress,
	parseUnits,
} from "viem";
import { optimism } from "viem/chains";
import { useAccount, useBalance, useReadContract, useSwitchChain } from "wagmi";

import { EndsIn } from "~/components/EndsIn";
import { Icon } from "~/components/Icon";
import { useHydrated } from "~/hooks/useHydrated";
import { SUBSCRIPTIONS_ABI } from "~/lib/abi.subscriptions";
import {
	DAI_OPTIMISM,
	LLAMAPAY_CHAINS_LIB,
	SUBSCRIPTION_DURATION,
} from "~/lib/constants";
import { useGetEnsName } from "~/queries/useGetEnsName";
import type { ISub } from "~/types";
import { formatNum } from "~/utils/formatNum";

import { calculateSubBalance } from "../_index/ManageSub";
import { formatSubs } from "../_index/utils";
import {
	useApproveToken,
	useExtendSubscription,
	useSubscribe,
} from "./actions";

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

export async function loader({ request }: LoaderFunctionArgs) {
	const searchParams = new URL(request.url).searchParams;
	const to = searchParams.get("to");
	const amount = searchParams.get("amount");
	const brandColor = searchParams.get("brandColor");
	const closeAfterPayment = searchParams.get("closeAfterPayment");
	if (
		typeof to !== "string" ||
		typeof amount !== "string" ||
		amount.length === 0 ||
		Number.isNaN(Number(amount)) ||
		Number(amount) === 0
	) {
		throw new Response("Not Found", { status: 404 });
	}

	const verification = fetch(`https://verify.sealed.art/verification/${to}`)
		.then((res) => res.json())
		.catch(() => null);

	const bgColor =
		typeof brandColor === "string" ? decodeURIComponent(brandColor) : "#23BF91";
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

	return defer({
		to: getAddress(to),
		amount,
		bgColor,
		textColor,
		bgColor2,
		textColor2,
		verification,
		closeAfterPayment,
	});
}

const AAVE_YIELD = 0.052;

export default function Index() {
	const loaderData: any = useLoaderData();

	const { address, isConnected, chain } = useAccount();
	const { switchChain } = useSwitchChain();
	const hydrated = useHydrated();

	// get current subscriptions of user where user is already subscribed to receiver on same/different tier
	const {
		data: subs,
		isLoading: fetchingSubs,
		error: errorFetchingSubs,
		refetch: refetchSubs,
	} = useQuery({
		queryKey: ["subs", address, loaderData.to],
		queryFn: () =>
			getSubscriptions({ owner: address, receiver: loaderData.to }),
		refetchInterval: 20_000,
	});

	const isUserAlreadyASubscriber = subs && subs.length > 0;
	const isUserSubscribedToSameTier =
		subs &&
		subs.length > 0 &&
		`${subs[0].amountPerCycle}` ===
			parseUnits(loaderData.amount, DAI_OPTIMISM.decimals).toString();

	// backward compatible with old contract
	const subsContract =
		subs && subs.length > 0
			? (subs[0].subsContract as `0x${string}`)
			: LLAMAPAY_CHAINS_LIB[optimism.id].contracts.subscriptions;

	// get current DAI balance of user
	const {
		data: balance,
		isLoading: fetchingBalance,
		error: errorFetchingBalance,
		refetch: refetchBalance,
	} = useBalance({
		address,
		token: DAI_OPTIMISM.address,
		chainId: optimism.id,
	});

	const formRef = useRef<HTMLFormElement>(null);

	const [amountToDepositNotDebounced, setAmountToDeposit] = useState("");
	const amountToDeposit = useDebounce(amountToDepositNotDebounced);
	const amountToDepositActually =
		(subs && subs.length > 0 ? subs[0].balanceLeft : 0n) +
		parseUnits(amountToDeposit, DAI_OPTIMISM.decimals);

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
			enabled: address ? true : false,
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
		allowance && amountToDeposit.length > 0
			? allowance >= amountToDepositActually
			: false;
	const {
		mutateAsync: approveToken,
		isPending: confirmingTokenApproval,
		error: errorConfirmingTokenApproval,
	} = useApproveToken();

	const {
		data: subscribeTxDataOnChain,
		mutateAsync: subscribe,
		isPending: confirmingSubscription,
		error: errorConfirmingSubscription,
	} = useSubscribe();
	const {
		data: waitingForSubscriptionTxDataOnChain,
		mutateAsync: subscriptionExtend,
		isPending: confirmingSubscriptionExtension,
		error: errorConfirmingSubscriptionExtension,
	} = useExtendSubscription();

	// amount per cycle from url query params
	const amountPerCycle = loaderData.amount;
	const decimalsAmountPerCycle = parseUnits(
		amountPerCycle,
		DAI_OPTIMISM.decimals,
	);
	// duration of current period where user cannot claim money deposited
	const currentTime = BigInt(Math.floor(Date.now() / 1e3));

	// calculate time left in current cycle
	let timeLeftInCurrentCycle = 0n;
	if (currentPeriod) {
		timeLeftInCurrentCycle =
			(currentPeriod as bigint) + BigInt(SUBSCRIPTION_DURATION) - currentTime;
		while (timeLeftInCurrentCycle < 0) {
			timeLeftInCurrentCycle += BigInt(SUBSCRIPTION_DURATION);
		}
	}
	const newCost = decimalsAmountPerCycle;
	// cost of subscription if user is already a subscriber
	const oldCost = isUserAlreadyASubscriber
		? BigInt(subs[0].amountPerCycle)
		: 0n;
	// if user is updtaing their subscription tier, calculate amount to be paid instantly
	let instantPayment =
		isUserAlreadyASubscriber && newCost > oldCost
			? ((newCost - oldCost) * timeLeftInCurrentCycle) /
				BigInt(SUBSCRIPTION_DURATION)
			: 0n;

	let amountForCurrentPeriod = 0n;
	if (currentPeriod) {
		if (isUserAlreadyASubscriber) {
			// if users current subscription hasn't started , instant payment should be 0
			if (
				subs?.[0]?.startTimestamp
					? +subs[0].startTimestamp > Date.now() / 1e3
					: false
			) {
				instantPayment = 0n;
				amountForCurrentPeriod = 0n;
			} else {
				amountForCurrentPeriod = instantPayment;
			}
		} else {
			amountForCurrentPeriod =
				(decimalsAmountPerCycle * timeLeftInCurrentCycle) /
				BigInt(SUBSCRIPTION_DURATION);
		}
	}

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		// if user is an existing subscriber , use batch to call unsubscribe() and subscribeForNextPeriod() to extend the current subscription
		if (subs && subs.length > 0) {
			const unsubscribe = encodeFunctionData({
				abi: SUBSCRIPTIONS_ABI,
				functionName: "unsubscribe",
				args: [
					BigInt(subs[0].initialPeriod),
					BigInt(subs[0].expirationDate),
					BigInt(subs[0].amountPerCycle),
					subs[0].receiver as `0x${string}`,
					BigInt(subs[0].accumulator),
					BigInt(subs[0].initialShares),
				],
			});

			const subscribeForNextPeriod = encodeFunctionData({
				abi: SUBSCRIPTIONS_ABI,
				functionName: "subscribeForNextPeriod",
				args: [
					loaderData.to,
					decimalsAmountPerCycle,
					amountToDepositActually,
					instantPayment,
				],
			});
			const calls = [
				...(subs[0].unsubscribed ? [] : [unsubscribe]),
				subscribeForNextPeriod,
			];
			subscriptionExtend?.({ address: subsContract, args: [calls, true] }).then(
				(data) => {
					if (data.status === "success") {
						// navigate("/");

						formRef.current?.reset();

						refetchBalance();
						refetchAllowance();
						refetchCurrentPeriod();
						refetchSubs();
						if (loaderData.closeAfterPayment === "true") {
							window?.opener?.postMessage("payment_success", "*");
							window.close();
						}
					}
				},
			);
		} else {
			subscribe?.({
				address: subsContract,
				args: [
					loaderData.to,
					decimalsAmountPerCycle,
					parseUnits(amountToDeposit, DAI_OPTIMISM.decimals) -
						amountForCurrentPeriod, // amountForFuture
				],
			}).then((data) => {
				if (data.status === "success") {
					// navigate("/");

					formRef.current?.reset();

					refetchBalance();
					refetchAllowance();
					refetchCurrentPeriod();
					refetchSubs();
					if (loaderData.closeAfterPayment === "true") {
						window?.opener?.postMessage("payment_success", "*");
						window.close();
					}
				}
			});
		}
	};
	// amount that cannot be claimed once subscribed
	const amountChargedInstantly = formatUnits(
		amountForCurrentPeriod,
		DAI_OPTIMISM.decimals,
	);
	// amount is only valid if its gte to amount charged instantly
	const isValidInputAmount = currentPeriod
		? parseUnits(amountToDeposit, DAI_OPTIMISM.decimals) +
				(subs?.[0]?.balanceLeft ?? 0n) >=
			amountForCurrentPeriod
		: +amountToDeposit >= +loaderData.amount;
	const isValidInputAmountNotDebounced = currentPeriod
		? parseUnits(amountToDepositNotDebounced, DAI_OPTIMISM.decimals) +
				(subs?.[0]?.balanceLeft ?? 0n) >=
			amountForCurrentPeriod
		: +amountToDepositNotDebounced >= +loaderData.amount;

	const disableAll =
		!hydrated ||
		!address ||
		!chain ||
		chain.id !== optimism.id ||
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
		!balance ||
		balance.value < parseUnits(amountToDeposit, DAI_OPTIMISM.decimals) ||
		!currentPeriod ||
		fetchingCurrentPeriod;

	const { data: ensName } = useGetEnsName({
		address: loaderData.to,
	});

	// durattion of current period where user cannot claim money deposited
	const currentPeriodEndsIn =
		Number(String(currentTime + timeLeftInCurrentCycle)) * 1e3;
	// if user is an existing subscriber, include claimable balance in current subscription
	const amountAfterDepositing =
		+formatUnits(subs?.[0]?.balanceLeft ?? 0n, DAI_OPTIMISM.decimals) +
		+amountToDeposit;
	// subtract amount charged instantly from claimable amount
	const claimableAmount = +formatUnits(
		(subs?.[0]?.balanceLeft ?? 0n) +
			parseUnits(amountToDeposit, DAI_OPTIMISM.decimals) -
			amountForCurrentPeriod,
		DAI_OPTIMISM.decimals,
	);

	// montly yield is based only on claimable amount
	const monthlyYield = (claimableAmount * AAVE_YIELD) / 12;
	// net cost per month for user
	const netCostPerMonth = monthlyYield - +loaderData.amount;
	const netCostFuture = currentPeriod ? loaderData.amount - monthlyYield : null;
	// expected subscription duration after depositing
	const expectedMonthsFuture = netCostFuture
		? Math.floor(claimableAmount / netCostFuture)
		: null;
	const expectedYears =
		expectedMonthsFuture && expectedMonthsFuture >= 12
			? (expectedMonthsFuture / 12) | 0
			: 0;
	const expectedMonths = expectedMonthsFuture ? expectedMonthsFuture % 12 : 0;

	const borderColor =
		loaderData.textColor === "#ffffff" ? "border-white/40" : "border-black/40";
	const hideTableColumns =
		!hydrated ||
		amountToDeposit.length === 0 ||
		!isValidInputAmount ||
		!currentPeriod;

	return (
		<main
			style={
				{
					"--page-bg-color": loaderData.bgColor,
					"--page-text-color": loaderData.textColor,
					"--page-bg-color-2": loaderData.bgColor2,
					"--page-text-color-2": loaderData.textColor2,
				} as CSSProperties
			}
			className="relative col-span-full row-span-full flex flex-col lg:bg-[linear-gradient(to_right,var(--page-bg-color)_50%,var(--page-bg-color-2)_50%)]"
		>
			{hydrated ? (
				<>
					{!isConnected ? (
						<Suspense
							fallback={
								<button
									className="absolute right-4 top-4 rounded-lg border p-2 text-[var(--page-text-color)] lg:border-[var(--page-bg-color)] lg:text-[var(--page-text-color-2)]"
									disabled
								>
									Connect Wallet
								</button>
							}
						>
							<ConnectWallet className="absolute right-4 top-4 rounded-lg border p-2 text-[var(--page-text-color)] lg:border-[var(--page-bg-color)] lg:text-[var(--page-text-color-2)]" />
						</Suspense>
					) : (
						<div className="absolute right-4 top-4 flex items-center gap-4">
							<Suspense fallback={<p />}>
								<AccountMenu className="absolute right-4 top-4 rounded-lg border p-2 text-[var(--page-text-color)] lg:border-[var(--page-bg-color)] lg:text-[var(--page-text-color-2)]" />
							</Suspense>
						</div>
					)}
				</>
			) : null}

			<div className="flex flex-1 flex-col lg:my-auto lg:flex-none lg:flex-row">
				<div className="flex-1 bg-[var(--page-bg-color)] text-[var(--page-text-color)]">
					<div className="mx-auto flex max-w-[650px] flex-col px-4 pb-9 pt-24 lg:ml-auto lg:px-[100px]">
						<button
							onClick={goBack}
							className="absolute top-4 flex items-center gap-1"
						>
							<Icon name="arrow-left-sm" className="h-6 w-6 flex-shrink-0" />
							<span className="sr-only">Navigate back</span>
						</button>
						<h1 className="flex flex-wrap items-center gap-1 text-lg font-medium text-[var(--page-text-color)] opacity-[0.85]">
							<span>Subscribe to</span>
							<span className="flex flex-nowrap gap-2">
								<a
									target="_blank"
									rel="noreferrer noopener"
									href={`https://optimistic.etherscan.io/address/${loaderData.to}`}
									className="underline"
									suppressHydrationWarning
								>
									{ensName ??
										`${loaderData.to.slice(0, 6)}...${loaderData.to.slice(-6)}`}
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
														<Icon
															name="twitter"
															className="relative -bottom-[1px] h-4 w-4"
														/>
													</a>
												) : null}
											</>
										)}
									</Await>
								</Suspense>
							</span>
						</h1>
						<p className="mr-auto mt-1 text-4xl font-semibold">
							<span className="flex items-center justify-center gap-1">
								<img src={DAI_OPTIMISM.img} width={36} height={36} alt="" />
								<span>{`${formatNum(+loaderData.amount, 2)} DAI`}</span>
								<span className="mb-[2px] mt-auto text-base font-normal opacity-[0.85]">
									/ month
								</span>
							</span>
						</p>
						<Link
							to="/"
							className="mt-10 flex items-center gap-1 text-sm underline opacity-[0.85]"
						>
							<Icon name="cog" className="h-4 w-4 flex-shrink-0" />
							<span className="">Manage your subscriptions</span>
						</Link>
						{hydrated && currentPeriod ? (
							<>
								<ul className="ml-4 mt-10 hidden list-disc flex-col gap-2 text-sm text-[var(--page-text-color)] opacity-90 lg:flex">
									{isUserAlreadyASubscriber ? (
										<>
											<li className="list-disc">
												You are an existing subscriber
											</li>
											{isUserSubscribedToSameTier ? null : (
												<li className="list-disc">
													You are updating your subscription tier from{" "}
													{formatUnits(oldCost, DAI_OPTIMISM.decimals)} DAI to{" "}
													{loaderData.amount} DAI per month
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
										After {`${getShortTimeFromDeadline(currentPeriodEndsIn)}`}{" "}
										{`you'll be charged ${formatNum(
											+loaderData.amount,
											2,
										)} DAI, repeated every 30 days`}
									</li>
									<li className="list-disc">
										You can withdraw balance left at any time
									</li>
								</ul>
							</>
						) : null}
					</div>
				</div>
				<div className="flex-1 bg-[var(--page-bg-color-2)] text-[var(--page-text-color-2)] lg:overflow-auto">
					<div className="mx-auto flex max-w-[650px] flex-col gap-5 overflow-auto px-4 pb-9 pt-9 lg:mr-auto lg:px-[100px] lg:pt-24">
						<form
							className="flex flex-col gap-4"
							onSubmit={handleSubmit}
							ref={formRef}
						>
							<label className="flex flex-col gap-1">
								<span>Amount to deposit</span>

								<span
									className={`relative isolate rounded-lg border ${
										loaderData.textColor2 === "#000000"
											? "border-black/[0.3] bg-black/[0.08]"
											: "border-white/[0.3] bg-white/[0.08]"
									} p-3 pb-[26px] outline-offset-2 focus-within:outline`}
								>
									<input
										name="amountToDeposit"
										className="relative z-10 w-full border-none bg-transparent pr-16 text-4xl !outline-none"
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
										disabled={
											confirmingSubscription || confirmingSubscriptionExtension
										}
									/>
									<span className="absolute bottom-0 right-4 top-3 my-auto flex flex-col gap-2">
										<p className="ml-auto flex items-center gap-1 text-xl">
											<img
												src={DAI_OPTIMISM.img}
												width={16}
												height={16}
												alt=""
											/>
											<span>DAI</span>
										</p>
										<p className="flex items-center gap-1 text-xs">
											<span>Balance:</span>
											{!hydrated || fetchingBalance ? (
												<span className="inline-block h-4 w-8 animate-pulse rounded bg-gray-400" />
											) : !isConnected || errorFetchingBalance ? (
												<span>-</span>
											) : (
												<>
													<span>
														{formatNum(
															balance ? +balance.formatted : null,
															2,
														) ?? "0"}
													</span>

													<button
														type="button"
														className="text-[var(--page-text-color-2)] underline"
														onClick={() =>
															setAmountToDeposit(balance?.formatted ?? "0")
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
								{!hydrated ||
								amountToDeposit.length <= 0 ||
								!isValidInputAmount ? (
									""
								) : netCostFuture && netCostFuture < 0 ? (
									<>
										<span>Free</span>
										<Ariakit.TooltipProvider showTimeout={0}>
											<Ariakit.TooltipAnchor
												render={
													<Icon
														name="question-mark-circle"
														className="h-5 w-5"
													/>
												}
											/>
											<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
												{`This assumes current yield (${AAVE_YIELD}% APR on your deposits) doesn't go down`}
											</Ariakit.Tooltip>
										</Ariakit.TooltipProvider>
									</>
								) : (
									<>
										<img src={DAI_OPTIMISM.img} width={14} height={14} alt="" />
										<span>{`${
											formatNum(netCostFuture, 2) ?? 0
										} DAI per month`}</span>
										<Ariakit.TooltipProvider showTimeout={0}>
											<Ariakit.TooltipAnchor
												render={
													<Icon
														name="question-mark-circle"
														className="h-5 w-5"
													/>
												}
											/>
											<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
												You will earn 5% APR on your deposits
											</Ariakit.Tooltip>
										</Ariakit.TooltipProvider>
									</>
								)}
							</p>
							{!hydrated ||
							amountToDeposit.length <= 0 ||
							!isValidInputAmount ? (
								<p
									className="flex items-center gap-1 text-sm"
									suppressHydrationWarning
								>
									Subscription Ends In:
								</p>
							) : expectedMonthsFuture && expectedMonthsFuture < 0 ? (
								<>
									<p className="flex items-center gap-1 text-sm">
										<span>Subscription Months: Infinite</span>
										<Ariakit.TooltipProvider showTimeout={0}>
											<Ariakit.TooltipAnchor
												render={
													<Icon
														name="question-mark-circle"
														className="h-5 w-5"
													/>
												}
											/>
											<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
												{`This assumes current yield (5% APR on your deposits) doesn't go down`}
											</Ariakit.Tooltip>
										</Ariakit.TooltipProvider>
									</p>
								</>
							) : isUserAlreadyASubscriber ? (
								isUserSubscribedToSameTier ? (
									<p
										className="flex flex-wrap items-center gap-1 text-sm"
										suppressHydrationWarning
									>
										Subscription Duration: Extended by{" "}
										{Math.trunc(+amountToDeposit / loaderData.amount)}{" "}
										{+amountToDeposit / loaderData.amount >= 2
											? "months"
											: "month"}
									</p>
								) : (
									<>
										{subs?.[0]?.startTimestamp &&
										+subs[0].startTimestamp > Date.now() / 1e3 ? (
											expectedMonthsFuture ? (
												<p
													className="flex flex-wrap items-center gap-1 text-sm"
													suppressHydrationWarning
												>
													Subscription Duration:{" "}
													{`${
														expectedYears > 0
															? `${expectedYears} ${
																	expectedYears > 1 ? "Years" : "Year"
																}, `
															: ""
													}${expectedMonths} ${
														expectedMonths > 1 ? "Months" : "Month"
													}`}
												</p>
											) : (
												<p
													className="flex flex-wrap items-center gap-1 text-sm"
													suppressHydrationWarning
												>
													Subscription Duration: Extended by{" "}
													{Math.trunc(+amountToDeposit / loaderData.amount)}{" "}
													{+amountToDeposit / loaderData.amount >= 2
														? "months"
														: "month"}
												</p>
											)
										) : (
											<p
												className="flex flex-wrap items-center gap-1 text-sm"
												suppressHydrationWarning
											>
												Subscription Ends In:{" "}
												{expectedMonthsFuture ? (
													<span>
														{`${
															expectedYears > 0
																? `${expectedYears} ${
																		expectedYears > 1 ? "Years" : "Year"
																	}, `
																: ""
														}${expectedMonths} ${
															expectedMonths > 1 ? "Months" : "Month"
														}, `}
													</span>
												) : null}
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
								<p
									className="flex flex-wrap items-center gap-1 text-sm"
									suppressHydrationWarning
								>
									Subscription Ends In:{" "}
									{expectedMonthsFuture ? (
										<span>
											{`${
												expectedYears > 0
													? `${expectedYears} ${
															expectedYears > 1 ? "Years" : "Year"
														}, `
													: ""
											}${expectedMonths} ${
												expectedMonths > 1 ? "Months" : "Month"
											}, `}
										</span>
									) : null}
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
											className="flex-1 rounded-lg bg-[var(--page-bg-color)] p-3 text-[var(--page-text-color)] disabled:opacity-60"
											disabled
										>
											Connect Wallet
										</button>
									}
								>
									<ConnectWallet
										className="flex-1 rounded-lg bg-[var(--page-bg-color)] p-3 text-[var(--page-text-color)] disabled:opacity-60"
										chainId={optimism.id}
									/>
								</Suspense>
							) : subscribeTxDataOnChain?.status === "success" ? (
								<button
									disabled
									className="flex-1 rounded-lg border border-[var(--page-bg-color)] bg-[var(--page-bg-color)] p-3 text-[var(--page-text-color)] disabled:bg-[var(--page-bg-color-2)] disabled:text-[var(--page-text-color-2)] disabled:opacity-60"
								>
									Subscribed!
								</button>
							) : chain.id !== optimism.id ? (
								<button
									onClick={() => switchChain?.({ chainId: optimism.id })}
									className="flex-1 rounded-lg bg-[var(--page-bg-color)] p-3 text-[var(--page-text-color)] disabled:opacity-60"
								>
									Switch Network
								</button>
							) : (
								<div className="flex flex-nowrap gap-4">
									<div className="flex flex-col justify-between gap-1 lg:-ml-12">
										<div
											className="h-8 w-8 rounded-full border-2 border-[var(--page-text-color-2)] bg-[var(--page-text-color-2)] first-of-type:mt-3 data-[disabled=true]:bg-[var(--page-bg-color-2)] data-[disabled=true]:opacity-40"
											data-disabled={
												!hydrated ||
												confirmingTokenApproval ||
												isApproved ||
												confirmingSubscription ||
												confirmingSubscriptionExtension ||
												amountToDeposit.length === 0
											}
										/>
										<div className="mx-auto min-h-[4px] w-[2px] flex-1 bg-[var(--page-text-color-2)] opacity-40" />
										<div
											className="mb-3 h-8 w-8 rounded-full border-2 border-[var(--page-text-color-2)] bg-[var(--page-text-color-2)] data-[disabled=true]:bg-[var(--page-bg-color-2)] data-[disabled=true]:opacity-40"
											data-disabled={
												!hydrated ||
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
											className="flex-1 rounded-lg border border-[var(--page-bg-color)] bg-[var(--page-bg-color)] p-3 text-[var(--page-text-color)] disabled:bg-[var(--page-bg-color-2)] disabled:text-[var(--page-text-color-2)] disabled:opacity-60"
											disabled={disableApprove}
											type="button"
											onClick={() => {
												approveToken?.({
													address: DAI_OPTIMISM.address,
													chainId: optimism.id,
													subsContract,
													amountToDeposit: amountToDepositActually,
												}).then((data) => {
													if (data.status === "success") {
														refetchAllowance();
														refetchCurrentPeriod();
													}
												});
											}}
										>
											{!hydrated
												? "Approve"
												: confirmingTokenApproval
													? "Confirming..."
													: isApproved
														? "Approved"
														: "Approve"}
										</button>

										<button
											className="flex-1 rounded-lg border border-[var(--page-bg-color)] bg-[var(--page-bg-color)] p-3 text-[var(--page-text-color)] disabled:bg-[var(--page-bg-color-2)] disabled:text-[var(--page-text-color-2)] disabled:opacity-60"
											disabled={disableSubscribe}
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

							{currentPeriod &&
							!isValidInputAmountNotDebounced &&
							amountToDepositNotDebounced.length > 0 ? (
								<p className="break-all text-center text-sm text-red-500">
									Amount less than cost for the current period
								</p>
							) : null}

							{hydrated && errorConfirmingTokenApproval ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-1
								>
									{(errorConfirmingTokenApproval as any)?.shortMessage ??
										errorConfirmingTokenApproval.message}
								</p>
							) : null}

							{hydrated &&
							errorConfirmingSubscription &&
							!(
								errorConfirmingSubscription.message.includes("hash") &&
								errorConfirmingSubscription.message.includes(
									"could not be found",
								)
							) ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-2
								>
									{(errorConfirmingSubscription as any)?.shortMessage ??
										errorConfirmingSubscription.message}
								</p>
							) : null}

							{hydrated &&
							errorConfirmingSubscriptionExtension &&
							!(
								errorConfirmingSubscriptionExtension.message.includes("hash") &&
								errorConfirmingSubscriptionExtension.message.includes(
									"could not be found",
								)
							) ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-3
								>
									{(errorConfirmingSubscriptionExtension as any)
										?.shortMessage ??
										errorConfirmingSubscriptionExtension.message}
								</p>
							) : null}

							{hydrated && errorFetchingAllowance ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-4
								>
									{(errorFetchingAllowance as any)?.shortMessage ??
										errorFetchingAllowance.message}
								</p>
							) : null}

							{hydrated && isConnected && errorFetchingCurrentPeriod ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-5
								>
									{(errorFetchingCurrentPeriod as any)?.shortMessage ??
										errorFetchingCurrentPeriod.message}
								</p>
							) : null}

							{hydrated && isConnected && errorFetchingSubs ? (
								<p
									className="break-all text-center text-sm text-red-500"
									data-error-6
								>
									{`Failed to fetch if you are a current subscriber - ${
										(errorFetchingSubs as any).message ?? ""
									}`}
								</p>
							) : null}

							{subscribeTxDataOnChain ? (
								subscribeTxDataOnChain.status === "success" ? (
									<p className="break-all text-center text-sm text-green-500">
										Transaction Success
									</p>
								) : (
									<p className="break-all text-center text-sm text-red-500">
										Transaction Failed
									</p>
								)
							) : null}
						</form>

						{hydrated && currentPeriod ? (
							<>
								<ul className="ml-4 mt-10 flex list-disc flex-col gap-2 text-sm text-[var(--page-text-color)] opacity-90 lg:hidden">
									{isUserAlreadyASubscriber ? (
										<>
											<li className="list-disc">
												You are an existing subscriber
											</li>
											{isUserSubscribedToSameTier ? null : (
												<li className="list-disc">
													You are updating your subscription tier from{" "}
													{formatUnits(oldCost, DAI_OPTIMISM.decimals)} DAI to{" "}
													{loaderData.amount} DAI per month
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
										After {`${getShortTimeFromDeadline(currentPeriodEndsIn)}`}{" "}
										{`you'll be charged ${formatNum(
											+loaderData.amount,
											2,
										)} DAI, repeated every 30 days`}
									</li>
									<li className="list-disc">
										You can withdraw balance left at any time
									</li>
								</ul>
							</>
						) : null}

						<div className="overflow-x-auto">
							<table className="mt-10 min-w-full border-collapse opacity-[0.85]">
								<tbody>
									<tr className={`border-b ${borderColor}`}>
										<th className="whitespace-nowrap p-2 pr-6 text-left text-sm font-normal">
											Your Deposit
										</th>
										{hideTableColumns ? (
											<td className="whitespace-nowrap p-2 pl-6 text-sm opacity-80">
												Input Amount
											</td>
										) : (
											<td className="whitespace-nowrap p-2 pl-6 text-sm">
												<span className="flex flex-nowrap items-center gap-1">
													<span className="whitespace-nowrap">
														{formatNum(amountAfterDepositing, 2)} DAI
													</span>{" "}
													{subs &&
													subs.length > 0 &&
													subs[0].balanceLeft !== 0n ? (
														<Ariakit.TooltipProvider showTimeout={0}>
															<Ariakit.TooltipAnchor
																render={
																	<Icon
																		name="question-mark-circle"
																		className="h-5 w-5"
																	/>
																}
															/>
															<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
																{`Includes remaining balance from current subscription (${formatUnits(
																	subs[0].balanceLeft,
																	DAI_OPTIMISM.decimals,
																)} DAI)`}
															</Ariakit.Tooltip>
														</Ariakit.TooltipProvider>
													) : null}
												</span>
											</td>
										)}
									</tr>
									{isUserAlreadyASubscriber ? null : (
										<tr className={`border-b ${borderColor}`}>
											<th className="whitespace-nowrap p-2 pr-6 text-left text-sm font-normal">
												After Instant Payment
											</th>
											{hideTableColumns ? (
												<td className="whitespace-nowrap p-2 pl-6 text-sm" />
											) : (
												<td className="whitespace-nowrap p-2 pl-6 text-sm">
													{formatNum(claimableAmount, 2)} DAI
												</td>
											)}
										</tr>
									)}
									<tr className={`border-b ${borderColor}`}>
										<th className="whitespace-nowrap p-2 pr-6 text-left text-sm font-normal">
											<span className="flex flex-nowrap items-center gap-1">
												<span>AAVE Yield</span>
												<Ariakit.TooltipProvider showTimeout={0}>
													<Ariakit.TooltipAnchor
														render={
															<Icon
																name="question-mark-circle"
																className="h-5 w-5"
															/>
														}
													/>
													<Ariakit.Tooltip className="max-w-xs cursor-default border border-solid border-black bg-white p-1 text-sm text-black">
														Average APY over the last 30 days
													</Ariakit.Tooltip>
												</Ariakit.TooltipProvider>
											</span>
										</th>
										{hideTableColumns ? (
											<td className="whitespace-nowrap p-2 pl-6 text-sm" />
										) : (
											<td className="whitespace-nowrap p-2 pl-6 text-sm">{`${
												AAVE_YIELD * 100
											}%`}</td>
										)}
									</tr>
									<tr className={`border-b ${borderColor}`}>
										<th className="whitespace-nowrap p-2 pr-6 text-left text-sm font-normal">
											Monthly Yield
										</th>
										{hideTableColumns ? (
											<td className="whitespace-nowrap p-2 pl-6 text-sm" />
										) : (
											<td className="whitespace-nowrap p-2 pl-6 text-sm">
												{`${monthlyYield < 0 ? "" : "+"}`}
												{formatNum(monthlyYield, 2)} DAI
											</td>
										)}
									</tr>
									<tr className={`border-b ${borderColor}`}>
										<th className="whitespace-nowrap p-2 pr-6 text-left text-sm font-normal">
											Subscription
										</th>
										{hideTableColumns ? (
											<td className="whitespace-nowrap p-2 pl-6 text-sm" />
										) : (
											<td className="whitespace-nowrap p-2 pl-6 text-sm">
												-{loaderData.amount} DAI
											</td>
										)}
									</tr>
									<tr className={`border-b ${borderColor}`}>
										<th className="whitespace-nowrap p-2 pr-6 text-left text-sm font-normal">
											Net Cost
										</th>
										{hideTableColumns ? (
											<td className="whitespace-nowrap p-2 pl-6 text-sm" />
										) : (
											<td className="whitespace-nowrap p-2 pl-6 text-sm">
												{`${netCostPerMonth < 0 ? "" : "+"}`}
												{formatNum(netCostPerMonth, 2)} DAI
											</td>
										)}
									</tr>
									<tr className={`border-b ${borderColor}`}>
										<th className="whitespace-nowrap p-2 pr-6 text-left text-sm font-normal">
											Duration
										</th>
										{hideTableColumns ? (
											<td className="whitespace-nowrap p-2 pl-6 text-sm" />
										) : isUserAlreadyASubscriber ? (
											<td className="whitespace-nowrap p-2 pl-6 text-sm">
												{expectedMonthsFuture
													? `${
															expectedYears > 0
																? `${expectedYears} ${
																		expectedYears > 1 ? "Years" : "Year"
																	}, `
																: ""
														}${expectedMonths} ${
															expectedMonths > 1 ? "Months" : "Month"
														}`
													: `Extended by ${Math.trunc(
															+amountToDeposit / loaderData.amount,
														)} ${
															+amountToDeposit / loaderData.amount >= 2
																? "months"
																: "month"
														}`}
											</td>
										) : (
											<td className="whitespace-nowrap p-2 pl-6 text-sm">
												{expectedMonthsFuture
													? `${
															expectedYears > 0
																? `${expectedYears} ${
																		expectedYears > 1 ? "Years" : "Year"
																	}, `
																: ""
														}${expectedMonths} ${
															expectedMonths > 1 ? "Months" : "Month"
														}, `
													: ""}
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

	if (!rgb) return "black";

	const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
	return luminance < 140 ? "#ffffff" : "#000000";
}

const getShortTimeFromDeadline = (deadline: number) => {
	const diffTime = Math.abs(
		new Date().valueOf() - new Date(deadline).valueOf(),
	);
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

function goBack(e: any) {
	const defaultLocation = "https://subscriptions.llamapay.io";
	const oldHash = window.location.hash;

	history.back(); // Try to go back

	const newHash = window.location.hash;

	/* If the previous page hasn't been loaded in a given time (in this case
	 * 1000ms) the user is redirected to the default location given above.
	 * This enables you to redirect the user to another page.
	 *
	 * However, you should check whether there was a referrer to the current
	 * site. This is a good indicator for a previous entry in the history
	 * session.
	 *
	 * Also you should check whether the old location differs only in the hash,
	 * e.g. /index.html#top --> /index.html# shouldn't redirect to the default
	 * location.
	 */

	if (
		newHash === oldHash &&
		(typeof document.referrer !== "string" || document.referrer === "")
	) {
		window.setTimeout(() => {
			// redirect to default location
			window.location.href = defaultLocation;
		}, 1000); // set timeout in ms
	}
	if (e) {
		if (e.preventDefault) e.preventDefault();
		if (e.preventPropagation) e.preventPropagation();
	}
	return false; // stop event propagation and browser default event
}

function useDebounce<T>(value: T, delay?: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedValue(value), delay || 500);

		return () => {
			clearTimeout(timer);
		};
	}, [value, delay]);

	return debouncedValue;
}

async function getSubscriptions({
	owner,
	receiver,
}: {
	owner?: string;
	receiver?: string;
}) {
	try {
		if (!owner || !receiver) return null;

		const data: { subs: Array<ISub> } = await fetch(
			`/legacy-subs?owner=${owner}&receiver=${receiver}`,
		).then((res) => res.json());

		const fSubs = formatSubs(
			(data?.subs ?? []).filter(
				(s) =>
					+s.realExpiration > Date.now() / 1e3 &&
					+s.startTimestamp !== +s.realExpiration,
			),
		);

		const balances = await Promise.allSettled(
			fSubs.map((sub) => calculateSubBalance(sub)),
		);

		return fSubs.map((fsub, index) => ({
			...fsub,
			balanceLeft:
				balances[index].status === "fulfilled"
					? (balances[index] as { value: bigint }).value
					: 0n,
		}));
	} catch (error: any) {
		throw new Error(error.message ?? "Failed to fetch subscriptions");
	}
}
