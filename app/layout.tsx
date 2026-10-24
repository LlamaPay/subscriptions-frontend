import { Outlet } from "react-router";

import { Header } from "~/components/Header";
import { Nav } from "~/components/Nav";

export default function Layout() {
	return (
		<>
			<Header />
			<Nav />
			<Outlet />
		</>
	);
}
