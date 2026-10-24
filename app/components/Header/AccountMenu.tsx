import * as Ariakit from "@ariakit/react";
import { useState } from "react";
import { formatUnits } from "viem";
import { useBalance, useConnection, useDisconnect, useEnsName } from "wagmi";

import { Icon } from "~/components/Icon";
import { formatAddress } from "~/utils/formatAddress";

export function AccountMenu({ className }: { className?: string }) {
	const dialog = Ariakit.useDialogStore();

	const { address } = useConnection();
	const { mutate: disconnect } = useDisconnect();
	const { data } = useBalance({ address });
	const { data: ensName } = useEnsName({ address, chainId: 1 });
	const [copied, setCopied] = useState(false);

	return (
		<>
			<Ariakit.Button
				onClick={dialog.show}
				className={
					className ??
					"hidden h-10 rounded-lg border border-[#E4EDEB] bg-[#f7fcfc] p-2 text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-60 md:inline dark:border-[#2d2d2d] dark:bg-[rgba(43,43,43,0.50)] dark:text-white"
				}
			>
				{address ? (ensName ?? formatAddress(address)) : null}
			</Ariakit.Button>
			<Ariakit.Dialog
				store={dialog}
				backdrop={<div className="dialog-backdrop" />}
				className="dialog"
			>
				<button
					type="button"
					className="ml-auto hidden h-6 w-6 items-center justify-center rounded-full bg-gray-100 md:flex dark:bg-black/20"
					onClick={dialog.toggle}
				>
					<Icon className="h-4 w-4 shrink-0" name="x-icon" />

					<span className="sr-only">Close Dialog</span>
				</button>

				<Ariakit.DialogHeading className="mt-4 text-center text-xl font-semibold">
					{ensName ?? formatAddress(address)}
				</Ariakit.DialogHeading>

				<p className="mt-1 text-center text-sm text-black/60 dark:text-white">{`${
					data ? formatUnits(data.value, data.decimals) : 0
				} ${data?.symbol ?? "ETH"}`}</p>
				<div className="mt-6 flex flex-wrap items-center justify-center gap-2">
					<button
						type="button"
						className="flex flex-1 flex-col items-center gap-1 rounded-lg bg-gray-100 p-2 text-sm dark:bg-black/20"
						onClick={() => {
							void navigator.clipboard.writeText(address ?? "");
							setCopied(true);
							setTimeout(() => {
								setCopied(false);
							}, 300);
						}}
					>
						<Icon name="copy" className="h-4 w-4" />
						<span>{copied ? "Copied" : "Copy Address"}</span>
					</button>
					<button
						type="button"
						className="flex flex-1 flex-col items-center gap-1 rounded-lg bg-gray-100 p-2 text-sm dark:bg-black/20"
						onClick={() => disconnect()}
					>
						<Icon
							name="arrow-left-on-rectangle"
							className="h-4 w-4"
							style={{ transform: "scale(-1)" }}
						/>

						<span>Disconnect</span>
					</button>
				</div>
			</Ariakit.Dialog>
		</>
	);
}
