import { announce, isRecord, onSiteThemeChange, part, setFrameTheme, siteTheme, type Theme } from './blocks-dom.ts';

type Mode = 'preview' | 'code' | 'split';

/** What the toolbar remembers while you move between variants. `theme: null` follows the site. */
interface View {
	width: 'full' | number;
	theme: Theme | null;
	mode: Mode;
}

const STORAGE_KEY = 'muxui-blocks:view';
const MIN_WIDTH = 280;
// Room beside the box for its resize handle.
const GUTTER = 24;

const isMode = (value: unknown): value is Mode => value === 'preview' || value === 'code' || value === 'split';

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
	return { width: 'full', theme: null, mode: 'preview' };
}

function saveView(view: View): void {
	try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(view)); } catch { /* storage unavailable */ }
}

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/** Wires one block detail pane: width presets and handle, preview theme, view mode, and copy. Returns the cleanup function. */
export function initDetail(root: HTMLElement): () => void {
	const stage = part(root, '[data-stage]');
	const frame = part(root, '[data-frame]');
	const box = part(root, '[data-frame-box]');
	const iframe = part<HTMLIFrameElement>(root, '[data-iframe]');
	const handle = part(root, '[data-handle]');
	const readout = part(root, '[data-readout]');
	const widthGroup = part(root, '[data-width-group]');
	const themeGroup = part(root, '[data-theme-group]');
	const modeGroup = part(root, '[data-mode-group]');
	const widthBlock = part(root, '.blocks-width');

	const abort = new AbortController();
	const { signal } = abort;
	const view = loadView();
	const effectiveTheme = () => view.theme ?? siteTheme();
	const available = () => Math.max(MIN_WIDTH, frame.clientWidth - GUTTER);
	let logical = 0;
	let scale = 1;

	function syncControls() {
		widthGroup.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(String(view.width) === button.dataset.width)));
		themeGroup.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.previewTheme === effectiveTheme())));
		modeGroup.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === view.mode)));
		stage.dataset.mode = view.mode;
		// Width and theme only apply while the preview is visible.
		widthBlock.inert = view.mode === 'code';
		themeGroup.inert = view.mode === 'code';
	}

	// The iframe keeps its logical width so the block's own media and container queries see the
	// preset; a preset wider than the stage is scaled down to fit.
	function layout() {
		const height = frame.clientHeight;
		if (!frame.clientWidth || !height) return;
		logical = view.width === 'full' ? available() : Math.max(MIN_WIDTH, view.width);
		scale = Math.min(1, available() / logical);
		box.style.width = `${logical * scale}px`;
		iframe.style.width = `${logical}px`;
		iframe.style.height = `${height / scale}px`;
		iframe.style.transform = scale < 1 ? `scale(${scale})` : 'none';
		readout.textContent = `${Math.round(logical)} px${scale < 1 ? ` at ${Math.round(scale * 100)}%` : ''}`;
		handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
		handle.setAttribute('aria-valuemax', String(Math.round(Math.max(available(), logical))));
		handle.setAttribute('aria-valuenow', String(Math.round(logical)));
		handle.setAttribute('aria-valuetext', `${Math.round(logical)} pixels wide`);
	}

	function setWidth(next: View['width']) {
		view.width = next;
		saveView(view);
		syncControls();
		layout();
	}

	const resizeTo = (outer: number) => setWidth(Math.round(Math.min(available(), Math.max(MIN_WIDTH, outer))));

	function setTheme(theme: Theme | null) {
		view.theme = theme;
		saveView(view);
		setFrameTheme(iframe, effectiveTheme());
		syncControls();
	}

	widthGroup.addEventListener('click', (event) => {
		const button = event.target instanceof Element ? event.target.closest('button') : null;
		const width = button?.dataset.width;
		if (width !== undefined) setWidth(width === 'full' ? 'full' : Number(width));
	}, { signal });
	themeGroup.addEventListener('click', (event) => {
		const button = event.target instanceof Element ? event.target.closest('button') : null;
		const theme = button?.dataset.previewTheme;
		if (theme === 'dark' || theme === 'light') setTheme(theme);
	}, { signal });
	modeGroup.addEventListener('click', (event) => {
		const button = event.target instanceof Element ? event.target.closest('button') : null;
		const mode = button?.dataset.mode;
		if (isMode(mode)) {
			view.mode = mode;
			saveView(view);
			syncControls();
		}
	}, { signal });

	handle.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		handle.focus();
		handle.setPointerCapture(event.pointerId);
		const startX = event.clientX;
		const startWidth = box.getBoundingClientRect().width;
		frame.classList.add('is-dragging');
		const move = (next: PointerEvent) => resizeTo(startWidth + next.clientX - startX);
		const end = () => {
			frame.classList.remove('is-dragging');
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', end);
			handle.removeEventListener('pointercancel', end);
		};
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', end);
		handle.addEventListener('pointercancel', end);
	}, { signal });
	handle.addEventListener('keydown', (event) => {
		const step = event.shiftKey ? 64 : 16;
		const current = box.getBoundingClientRect().width;
		if (event.key === 'ArrowLeft') resizeTo(current - step);
		else if (event.key === 'ArrowRight') resizeTo(current + step);
		else if (event.key === 'Home') resizeTo(MIN_WIDTH);
		else if (event.key === 'End') setWidth('full');
		else return;
		event.preventDefault();
	}, { signal });

	const copy = part(root, '[data-copy]');
	copy.addEventListener('click', async () => {
		// The rendered code's text is the exact example source, so it is what is copied.
		const copied = await copyText(part(root, '[data-code-body] code').textContent ?? '');
		const label = copy.textContent;
		copy.textContent = copied ? 'Copied' : 'Copy failed';
		announce(copied ? 'Code copied to clipboard' : 'Copy failed');
		window.setTimeout(() => { copy.textContent = label; }, 1500);
	}, { signal });

	iframe.addEventListener('load', () => setFrameTheme(iframe, effectiveTheme()), { signal });
	// The preview starts in the site theme, so only a remembered override needs a reload.
	if (effectiveTheme() !== siteTheme()) {
		const src = new URL(iframe.getAttribute('src') ?? '', location.href);
		src.searchParams.set('theme', effectiveTheme());
		iframe.contentWindow?.location.replace(src);
	}
	const stopSiteTheme = onSiteThemeChange(() => setTheme(null));
	const observer = new ResizeObserver(layout);
	observer.observe(frame);

	syncControls();
	layout();
	return () => {
		abort.abort();
		observer.disconnect();
		stopSiteTheme();
	};
}
