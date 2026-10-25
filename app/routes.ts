import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
	layout("layout.tsx", [index("routes/_index/route.tsx")]),
	// Merchants link here, so it keeps its full-page layout without the header and sidebar.
	route("subscribe", "routes/subscribe/route.tsx"),
] satisfies RouteConfig;
