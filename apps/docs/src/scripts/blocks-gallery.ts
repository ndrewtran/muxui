import { onSiteThemeChange, setFrameTheme, siteTheme } from './blocks-dom.ts';

// Thumbnails render the real preview at a fixed logical size and scale it to the card.
const THUMB_WIDTH = 1024;

/** Wires the gallery's scaled previews. Returns the cleanup function. */
export function initGallery(root: HTMLElement): () => void {
	const thumbs = [...root.querySelectorAll<HTMLElement>('[data-thumb]')];
	const fit = (thumb: HTMLElement) => {
		const frame = thumb.querySelector('iframe');
		if (frame) frame.style.transform = `scale(${thumb.clientWidth / THUMB_WIDTH})`;
	};
	const observer = new ResizeObserver((entries) => entries.forEach(({ target }) => target instanceof HTMLElement && fit(target)));
	const frames = thumbs.flatMap((thumb) => {
		fit(thumb);
		observer.observe(thumb);
		return [...thumb.querySelectorAll('iframe')];
	});
	const apply = () => frames.forEach((frame) => setFrameTheme(frame, siteTheme()));
	const loadListeners = frames.map((frame) => {
		frame.addEventListener('load', apply);
		return () => frame.removeEventListener('load', apply);
	});
	const stopTheme = onSiteThemeChange(apply);
	return () => {
		observer.disconnect();
		stopTheme();
		loadListeners.forEach((remove) => remove());
	};
}
