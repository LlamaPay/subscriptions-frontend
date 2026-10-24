import { useSyncExternalStore } from "react";

import type { ColorScheme } from "./types";

// localStorage holds "light" or "dark"; no entry means "system".
export const colorSchemeStorageKey = "color-scheme";
// Fired on window after a toggle, since the storage event only reaches other tabs.
const colorSchemeChangeEvent = "color-scheme-change";

function subscribeToColorScheme(onChange: () => void) {
	window.addEventListener("storage", onChange);
	window.addEventListener(colorSchemeChangeEvent, onChange);

	return () => {
		window.removeEventListener("storage", onChange);
		window.removeEventListener(colorSchemeChangeEvent, onChange);
	};
}

// Touching localStorage throws when site data is blocked, or in a third-party
// frame (the Safe App) with third-party cookies blocked. The root Layout reads
// the theme, so a throw here would blank every page; the theme then lives in
// memory for the visit instead.
let unsavedColorScheme: ColorScheme = "system";

function getColorScheme(): ColorScheme {
	try {
		const value = localStorage.getItem(colorSchemeStorageKey);

		return value === "light" || value === "dark" ? value : "system";
	} catch {
		return unsavedColorScheme;
	}
}

function useColorScheme(): ColorScheme {
	return useSyncExternalStore(subscribeToColorScheme, getColorScheme, () => "system");
}

export function setColorScheme(colorScheme: "light" | "dark") {
	try {
		localStorage.setItem(colorSchemeStorageKey, colorScheme);
	} catch {
		unsavedColorScheme = colorScheme;
	}

	window.dispatchEvent(new Event(colorSchemeChangeEvent));
}

const systemDarkQuery = "(prefers-color-scheme: dark)";

function subscribeToSystemColorScheme(onChange: () => void) {
	const media = window.matchMedia(systemDarkQuery);

	media.addEventListener("change", onChange);

	return () => media.removeEventListener("change", onChange);
}

// The scheme the page shows: "system" follows the OS setting, as ColorSchemeScript does.
export function useResolvedColorScheme(): "dark" | "light" {
	const colorScheme = useColorScheme();

	const systemIsDark = useSyncExternalStore(
		subscribeToSystemColorScheme,
		() => window.matchMedia(systemDarkQuery).matches,
		() => false,
	);

	if (colorScheme === "system") {
		return systemIsDark ? "dark" : "light";
	}

	return colorScheme;
}
