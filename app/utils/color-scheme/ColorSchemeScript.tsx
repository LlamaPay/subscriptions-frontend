import { colorSchemeStorageKey } from "./components";

// Sets the `dark` class before the app renders, so the first paint uses the right
// scheme. After hydration the root Layout sets the class from useResolvedColorScheme.
// The block keeps `colorScheme` out of the page's global scope. Blocked storage
// throws on access, which leaves the system scheme.
const script = `{
	let colorScheme = null;
	try {
		colorScheme = localStorage.getItem(${JSON.stringify(colorSchemeStorageKey)});
	} catch {}
	if (colorScheme === "dark" || (colorScheme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
		document.documentElement.classList.add("dark");
	}
}`;

export function ColorSchemeScript() {
	// oxlint-disable-next-line react/no-danger
	return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
