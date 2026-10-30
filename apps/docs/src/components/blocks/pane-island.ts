import { useLayoutEffect, useRef } from 'react';

const committed = new WeakSet<Element>();
const commitEvent = 'blocks:commit';

/** A pane island's first React commit, which Astro's `ssr` removal does not establish. */
export function usePaneIsland() {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const island = ref.current?.closest('astro-island');
		if (!island) return;
		committed.add(island);
		island.dispatchEvent(new Event(commitEvent));
	}, []);
	return ref;
}

/**
 * Navigation can remove an island between hydrateRoot and its first commit. Astro's
 * after-swap event would then unmount a dehydrated root (React error 424). Keep the
 * swap immediate, but let that root commit before passing its unmount to React.
 */
export function preparePaneRemoval(pane: Element) {
	for (const island of pane.querySelectorAll('astro-island')) {
		island.addEventListener('astro:unmount', (event) => {
			if (committed.has(island)) return;
			event.stopImmediatePropagation();
			// An island removed before hydration starts has no React root to dispose of;
			// Astro skips its hydration while disconnected, so this listener is collected with it.
			island.addEventListener(commitEvent, () => {
				// Leave React's commit stack before requesting its synchronous unmount.
				queueMicrotask(() => island.dispatchEvent(new Event('astro:unmount')));
			}, { once: true });
		}, { capture: true, once: true });
	}
}
