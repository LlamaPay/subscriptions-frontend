import * as Ariakit from "@ariakit/react";
import { useConnection, useSwitchChain } from "wagmi";

import { Icon } from "~/components/Icon";
import { chainIdToNames, config } from "~/lib/wallet";
import { formatChainName } from "~/utils/formatChainName";

export function NetworkMenu() {
	const { chain } = useConnection();
	const { mutate: switchChain } = useSwitchChain();

	return (
		<Ariakit.MenuProvider>
			<Ariakit.MenuButton className="hidden h-10 items-center gap-2 rounded-lg border border-[#E4EDEB] bg-[#f7fcfc] p-2 text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-60 md:flex dark:border-[#2d2d2d] dark:bg-[rgba(43,43,43,0.50)] dark:text-white">
				<>
					<span className="sr-only">Switch network from </span>
					<span className="h-4 w-4 rounded-full">
						{chain ? (
							<img
								src={`https://icons.llamao.fi/icons/chains/rsz_${chainIdToNames[chain.id].iconServerName}?w=48&h=48`}
								alt=""
								className="h-4 w-4 rounded-full"
							/>
						) : null}
					</span>
					<span>{chain ? formatChainName(chain.name) : ""}</span>
					<Icon
						className="h-4 w-4 shrink-0 text-[#3D3D3D] dark:text-white/60"
						name="arrow-select"
					/>
				</>
			</Ariakit.MenuButton>
			<Ariakit.Menu
				gutter={4}
				className="z-10 hidden flex-col items-center gap-1 rounded-lg border border-[#E4EDEB] bg-[#f7fcfc] p-1 text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-60 md:flex dark:border-[#2d2d2d] dark:bg-[rgba(43,43,43,0.50)] dark:text-white"
			>
				{config.chains.map((option) => {
					return (
						<Ariakit.MenuItem
							className="mr-auto flex cursor-pointer items-center gap-2 rounded-lg p-2"
							key={option.name}
							onClick={() => switchChain({ chainId: option.id })}
						>
							<span className="h-4 w-4 rounded-full">
								<img
									src={`https://icons.llamao.fi/icons/chains/rsz_${chainIdToNames[option.id].iconServerName}?w=48&h=48`}
									alt=""
									className="h-4 w-4 rounded-full"
								/>
							</span>
							<span>{formatChainName(option.name)}</span>
						</Ariakit.MenuItem>
					);
				})}
			</Ariakit.Menu>
		</Ariakit.MenuProvider>
	);
}
