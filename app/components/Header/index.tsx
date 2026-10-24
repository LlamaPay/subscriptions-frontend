import { Suspense, lazy } from "react";
import { Link } from "react-router";
import { useConnection } from "wagmi";

import logoDark from "~/assets/icons/logo-dark.svg";
import logoLight from "~/assets/icons/logo-light.svg";
import moon from "~/assets/icons/moon.svg";
import sun from "~/assets/icons/sun.svg";
import { Icon } from "~/components/Icon";
import { useHydrated } from "~/hooks/useHydrated";
import { setColorScheme, useResolvedColorScheme } from "~/utils/color-scheme/components";

const AccountMenu = lazy(() =>
	import("~/components/Header/AccountMenu").then((module) => ({
		default: module.AccountMenu,
	})),
);
const AppMenu = lazy(() =>
	import("~/components/Header/AppMenu").then((module) => ({
		default: module.AppMenu,
	})),
);
const ConnectWallet = lazy(() =>
	import("~/components/ConnectWallet").then((module) => ({
		default: module.ConnectWallet,
	})),
);
const NetworkMenu = lazy(() =>
	import("~/components/Header/NetworkMenu").then((module) => ({
		default: module.NetworkMenu,
	})),
);

export function Header() {
	const theme = useResolvedColorScheme();
	const hydrated = useHydrated();
	const { isConnected } = useConnection();

	return (
		<header className="col-span-full flex flex-wrap items-center gap-4 border-b border-black/5 p-4 md:px-8 dark:border-white/5">
			<Link to="/" className="mr-auto h-8 md:h-10">
				<img src={theme === "dark" ? logoLight : logoDark} alt="" className="mr-auto h-8 md:h-10" />
				<span className="sr-only">navigate to home page</span>
			</Link>

			{hydrated ? (
				<>
					{!isConnected ? (
						<Suspense
							fallback={
								<button
									type="button"
									className="h-10 rounded-lg border border-[#E4EDEB] bg-[#f7fcfc] p-2 text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#2d2d2d] dark:bg-[rgba(43,43,43,0.50)] dark:text-white"
									disabled
								>
									Connect Wallet
								</button>
							}
						>
							<ConnectWallet className="h-10 rounded-lg border border-[#E4EDEB] bg-[#f7fcfc] p-2 text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#2d2d2d] dark:bg-[rgba(43,43,43,0.50)] dark:text-white" />
						</Suspense>
					) : (
						<>
							<Suspense fallback={<p />}>
								<NetworkMenu />
							</Suspense>
							<Suspense fallback={<p />}>
								<AccountMenu />
							</Suspense>
							<Suspense
								fallback={
									<button
										type="button"
										className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E4EDEB] bg-[#f7fcfc] p-2 text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-60 md:hidden dark:border-[#2d2d2d] dark:bg-[rgba(43,43,43,0.50)] dark:text-white"
									>
										<span className="sr-only">Open Menu</span>
										<Icon
											className="h-4 w-4 shrink-0 text-[#3D3D3D] dark:text-white/60"
											name="three-dots"
										/>
									</button>
								}
							>
								<AppMenu />
							</Suspense>
						</>
					)}
				</>
			) : null}
			<button
				type="button"
				className="hidden h-10 w-10 items-center justify-center rounded-lg border border-[#E4EDEB] bg-[#f7fcfc] p-2 text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-60 md:flex dark:border-[#2d2d2d] dark:bg-[rgba(43,43,43,0.50)] dark:text-white"
				onClick={() => setColorScheme(theme === "dark" ? "light" : "dark")}
			>
				<img src={theme === "dark" ? moon : sun} alt="" className="h-4" />
				<span className="sr-only">Change Theme</span>
			</button>
		</header>
	);
}
