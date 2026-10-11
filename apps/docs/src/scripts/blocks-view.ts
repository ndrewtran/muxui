import { useSyncExternalStore } from 'react';
import { isRecord, type Theme } from './blocks-dom.ts';

export type Mode = 'preview' | 'code' | 'split';

/** What the toolbar remembers while you move between variants. `theme: null` follows the site. */
export interface View {
	width: 'full' | number;
	theme: Theme | null;
	mode: Mode;
}

export const MIN_WIDTH = 280;

const STORAGE_KEY = 'muxui-blocks:view';
const defaultView: View = { width: 'full', theme: null, mode: 'preview' };

export const isMode = (value: unknown): value is Mode => value === 'preview' || value === 'code' || value === 'split';

function loadView(): View {
	try {
		const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
		if (isRecord(stored)) {
			const { width, theme, mode } = stored;
			return {
				width: width === 'full' || (typeof width === 'number' && width >= MIN_WIDTH) ? width : 'full',
				theme: theme === 'dark' || theme === 'light' ? theme : null,
				mode: isMode(mode) ? mode : 'preview',
			};
		}
	} catch { /* storage unavailable or malformed: start fresh */ }
	return defaultView;
}

let view: View | undefined;
const listeners = new Set<() => void>();

/** The toolbar state now, for code outside a render. */
export const getView = () => (view ??= loadView());

/** Changes the toolbar state and remembers it for this tab. */
export function setView(patch: Partial<View>) {
	const current = getView();
	const next = { ...current, ...patch };
	if (next.width === current.width && next.theme === current.theme && next.mode === current.mode) return;
	view = next;
	try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
	listeners.forEach((listener) => listener());
}

/** The toolbar state. The server and the first client render show the defaults. */
export function useView(): View {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => { listeners.delete(listener); };
		},
		getView,
		() => defaultView,
	);
}
