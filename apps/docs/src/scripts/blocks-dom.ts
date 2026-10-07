export type Theme = 'dark' | 'light';

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A required descendant; the Blocks markup is server-rendered, so a miss is a bug, not a state. */
export function part<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Blocks markup is missing ${selector}.`);
	return element;
}

/** The site theme Starlight's picker keeps on the root element. */
export function siteTheme(): Theme {
	return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Calls `listener` whenever the site theme changes. Returns the stop function. */
export function onSiteThemeChange(listener: (theme: Theme) => void): () => void {
	const observer = new MutationObserver(() => listener(siteTheme()));
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	return () => observer.disconnect();
}

/** Sets an isolated preview document's theme. Previews are same-origin, so the parent can reach in. */
export function setFrameTheme(frame: HTMLIFrameElement, theme: Theme): void {
	const root = frame.contentDocument?.documentElement;
	if (root) root.dataset.theme = theme;
}

export function announce(message: string): void {
	const live = document.getElementById('blocks-live');
	if (live) live.textContent = message;
}
