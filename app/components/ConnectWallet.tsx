import * as Ariakit from "@ariakit/react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";

import brave from "~/assets/wallets/brave.svg";
import coinbase from "~/assets/wallets/coinbase.svg";
import metamask from "~/assets/wallets/metamask.svg";
import phantom from "~/assets/wallets/phantom.svg";
import rabby from "~/assets/wallets/rabby.svg";
import rainbow from "~/assets/wallets/rainbow.svg";
import safe from "~/assets/wallets/safe.svg";
import uniswap from "~/assets/wallets/uniswap.svg";
import walletconnect from "~/assets/wallets/walletconnect.svg";
import { Icon } from "~/components/Icon";

const walletIcons = Object.entries({
	brave,
	coinbase,
	metamask,
	phantom,
	rabby,
	safe,
	uniswap,
	walletconnect,
	rainbow,
});

export function ConnectWallet({ className }: { className: string }) {
	const dialog = Ariakit.useDialogStore();

	const { connector } = useConnection();
	const connectors = useConnectors();
	const { mutate: connect, error } = useConnect();
	const { mutate: disconnect } = useDisconnect();

	return (
		<>
			<Ariakit.Button onClick={dialog.show} className={className}>
				Connect Wallet
			</Ariakit.Button>
			<Ariakit.Dialog
				store={dialog}
				backdrop={<div className="dialog-backdrop" />}
				className="dialog flex flex-col gap-8"
			>
				<Ariakit.DialogHeading className="text-center text-lg font-semibold">
					Connect Wallet
				</Ariakit.DialogHeading>

				<button
					type="button"
					className="absolute top-[26px] right-6 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-black dark:bg-black/20 dark:text-white"
					onClick={dialog.toggle}
				>
					<Icon className="h-4 w-4 shrink-0" name="x-icon" />
					<span className="sr-only">Close Dialog</span>
				</button>

				<ul className="flex flex-col gap-4">
					{connectors.map((cntr) => (
						<li key={cntr.id} className="flex items-center">
							<button
								type="button"
								onClick={() => {
									if (connector?.id === cntr.id) {
										disconnect(
											{ connector: cntr },
											{ onSuccess: () => connect({ connector: cntr }) },
										);
									} else {
										connect({ connector: cntr });
									}

									if (!error) {
										dialog.toggle();
									}
								}}
								className="relative m-auto flex flex-1 items-center gap-1 rounded-lg bg-gray-100 p-4 disabled:opacity-50 dark:bg-black/20"
							>
								<span className="mr-auto">{cntr.name}</span>

								<span className="rounded-lg border border-white/10">
									<ConnectorLogo name={cntr.name} />
								</span>
							</button>
						</li>
					))}
				</ul>
				{error ? <p className="text-center text-sm text-red-500">{error.message}</p> : null}
			</Ariakit.Dialog>
		</>
	);
}

function ConnectorLogo({ name }: { name: string }) {
	const src = walletIcons.find(([wname]) => name.toLowerCase().includes(wname))?.[1] ?? null;

	if (!src) {
		return null;
	}

	return <img src={src} alt="" className="h-6 w-6 shrink-0 rounded-lg object-cover" />;
}
