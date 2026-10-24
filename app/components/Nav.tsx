import { Link, useLocation } from "react-router";

export function Nav() {
	const location = useLocation();

	return (
		<nav className="hidden h-full w-full flex-col gap-3 px-8 py-9 md:flex">
			<Link
				to="/"
				className="font-semibold text-black data-[active=true]:text-[#13785a] dark:text-white dark:data-[active=true]:text-[#23BF91]"
				data-active={location.pathname === "/"}
			>
				Dashboard
			</Link>
			<hr className="border-black/15 dark:border-white/15" />
			<a
				href="https://docs.llamapay.io/"
				target="_blank"
				rel="noreferrer noopener"
				className="font-semibold text-black data-[active=true]:text-[#13785a] dark:text-white dark:data-[active=true]:text-[#23BF91]"
			>
				Docs
			</a>
		</nav>
	);
}
