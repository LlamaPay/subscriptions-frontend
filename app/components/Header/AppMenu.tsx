import * as Ariakit from "@ariakit/react";
import type { MenuButtonProps, MenuItemProps } from "@ariakit/react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useConnection, useDisconnect, useEnsName, useSwitchChain } from "wagmi";

import { Icon } from "~/components/Icon";
import { chainIdToNames, config } from "~/lib/wallet";
import { formatAddress } from "~/utils/formatAddress";
import { formatChainName } from "~/utils/formatChainName";

export function AppMenu() {
	const location = useLocation();
	const { address, chain } = useConnection();
	const { mutate: switchChain } = useSwitchChain();
	const { data: ensName } = useEnsName({
		address,
		chainId: 1,
	});
	const { mutate: disconnect } = useDisconnect();

	return (
		<Menu
			label={
				<>
					<span className="sr-only">Open Menu</span>
					<Icon className="h-4 w-4 shrink-0 text-[#3D3D3D] dark:text-white/60" name="three-dots" />
				</>
			}
			className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E4EDEB] bg-[#f7fcfc] p-2 text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-60 md:hidden dark:border-[#2d2d2d] dark:bg-[rgba(43,43,43,0.50)] dark:text-white"
		>
			<Ariakit.MenuDescription className="w-full p-2 text-left">
				{ensName ?? formatAddress(address)}
			</Ariakit.MenuDescription>

			<Menu label="Switch Network" className="p-2">
				{config.chains.map((chainx) => {
					return (
						<MenuItem
							className="mr-auto flex cursor-pointer items-center gap-2 rounded-lg p-2"
							key={chainx.name}
							onClick={() => switchChain({ chainId: chainx.id })}
						>
							<span className="h-4 w-4 rounded-full">
								<img
									src={`https://icons.llamao.fi/icons/chains/rsz_${chainIdToNames[chainx.id].iconServerName}?w=48&h=48`}
									alt=""
									className="h-4 w-4 rounded-full"
								/>
							</span>
							<span>{formatChainName(chainx.name)}</span>

							{chain?.id === chainx.id ? (
								<span className="ml-auto h-[6px] w-[6px] rounded-full bg-green-500" />
							) : null}
						</MenuItem>
					);
				})}
			</Menu>
			<MenuItem
				render={<Link to="/" />}
				className="w-full p-2 text-left"
				data-active={location.pathname === "/"}
			>
				Dashboard
			</MenuItem>
			<MenuItem
				render={<a href="https://docs.llamapay.io/">Docs</a>}
				className="w-full p-2 text-left"
			/>
			<MenuItem onClick={() => disconnect()} className="w-full p-2 text-left">
				Disconnect
			</MenuItem>
		</Menu>
	);
}

function MenuItem(props: MenuItemProps) {
	return <Ariakit.MenuItem {...props} />;
}

interface MenuProps extends MenuButtonProps<"div"> {
	label: ReactNode;
}

function Menu({ label, children, ...props }: MenuProps) {
	const menu = Ariakit.useMenuStore();
	return (
		<Ariakit.MenuProvider store={menu}>
			<Ariakit.MenuButton
				{...props}
				className={props.className}
				render={menu.parent ? <MenuItem render={props.render} /> : undefined}
			>
				{label}
			</Ariakit.MenuButton>
			<Ariakit.Menu
				gutter={8}
				shift={menu.parent ? -9 : 0}
				className="z-10 flex flex-col items-center gap-1 rounded-lg border border-[#E4EDEB] bg-[#f7fcfc] p-1 text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-60 md:hidden dark:border-[#2d2d2d] dark:bg-[#242424] dark:text-white"
			>
				{children}
			</Ariakit.Menu>
		</Ariakit.MenuProvider>
	);
}
