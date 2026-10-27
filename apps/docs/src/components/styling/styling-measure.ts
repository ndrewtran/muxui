// The page script of the Styling section. The docs build serves it once, as /_muxui/styling-measure.<hash of this script>.js (see astro.config.mjs), and
// every component page loads that one cached file with a deferred script tag (StylingMeasure.astro): it is the same for every page, so no
// page carries a copy, and the name changes with the script, so a cached copy is never paired with another build's page. It runs once the page is parsed; the previews are client-only and render later, so it waits for them (see `schedule`).
//
// It names the scrollers and measures the recipe in the reader's browser.
//
// Scroll regions: a table or a code block that is wider than its column scrolls, and a scroller must be reachable from the keyboard and
// have a name. Only one that overflows right now gets the region role, a name and a tab stop, so a section that fits adds no stop.
const regions = document.querySelectorAll<HTMLElement>('#styling [data-styling-scroll]');

function labelRegion(region: HTMLElement) {
	if (region.scrollWidth > region.clientWidth + 1) {
		region.setAttribute('role', 'region');
		// A table is named by its caption; a code block or a preview carries its own name.
		const name = region.dataset.stylingScroll || region.querySelector('caption')?.textContent || 'Styling';
		region.setAttribute('aria-label', `${name} (scrollable)`);
		region.tabIndex = 0;
	} else {
		region.removeAttribute('role');
		region.removeAttribute('aria-label');
		region.removeAttribute('tabindex');
	}
}

const resizes = new ResizeObserver((entries) => {
	for (const { target } of entries) {
		const region = target instanceof HTMLElement && target.matches('[data-styling-scroll]') ? target : target.closest<HTMLElement>('[data-styling-scroll]');
		if (region !== null) labelRegion(region);
	}
});
for (const region of regions) {
	labelRegion(region);
	resizes.observe(region);
	// The table inside grows without its scroller changing size, so it is watched too.
	if (region.firstElementChild instanceof HTMLElement) resizes.observe(region.firstElementChild);
}

// Computed change: each row of the recipe's table is read from the two previews, the Default and the With-the-recipe panes, in this
// browser and for this theme, once transitions have settled (a value read right after an assignment can still be the old one). The
// cell says what is true: a value pair, `unchanged`, no element, or a property the browser did not report. A target with no text is
// marked `computed only`: the property changed, and nothing visible shows it. A step the Basic example cannot show (a state) says so
// in one cell until both previews show it, and is read like any other the moment they do: the previews are live, so opening a
// disclosure in each is how a reader gets its state row.
const table = document.querySelector<HTMLTableElement>('#styling [data-styling-table="computed"]');
const before = document.querySelector<HTMLElement>('#styling [data-styling-pane="default"]');
const after = document.querySelector<HTMLElement>('#styling [data-styling-pane="recipe"]');

if (table !== null && before !== null && after !== null) {
	const panes = [before, after];
	const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody > tr[data-step-target]')];

	/** The computed value of a property on the first element a selector finds inside a pane; null when there is no element, '' when the browser reports no value. */
	function read(pane: HTMLElement, target: string, property: string) {
		let element: Element | null;
		try {
			element = pane.querySelector(target);
		} catch {
			return null;
		}
		return element === null ? null : getComputedStyle(element).getPropertyValue(property).trim();
	}

	/** A client-only preview is empty (or showing "Loading example") until it renders: say nothing about its elements before then. */
	const rendered = (pane: HTMLElement) => {
		const islands = [...pane.querySelectorAll('astro-island')];
		return islands.length > 0 && islands.every((island) => island.firstElementChild !== null && island.querySelector('.example-loading') === null);
	};

	/** The headings an example renders belong to the example, not to this page's outline: they stay on screen and stop being headings. */
	const isolateOutline = () => {
		for (const pane of panes) {
			for (const heading of pane.querySelectorAll('.styling-frame :is(h1, h2, h3, h4, h5, h6)')) {
				if (heading.getAttribute('role') !== 'presentation') heading.setAttribute('role', 'presentation');
			}
		}
	};

	/** A row of a step the Basic example cannot show: one cell over both columns, until both previews show the state. */
	function showStatic(row: HTMLTableRowElement, text: string) {
		const [beforeCell, afterCell] = row.querySelectorAll<HTMLTableCellElement>('td[data-measure]');
		beforeCell.colSpan = 2;
		beforeCell.textContent = text;
		afterCell.hidden = true;
		afterCell.textContent = '';
	}

	async function settle() {
		const running = panes.flatMap((pane) => pane.getAnimations({ subtree: true }));
		await Promise.race([Promise.allSettled(running.map((animation) => animation.finished)), new Promise((done) => window.setTimeout(done, 1000))]);
	}

	async function measure() {
		if (!panes.every(rendered)) return;
		await settle();
		for (const row of rows) {
			const [beforeCell, afterCell] = row.querySelectorAll<HTMLTableCellElement>('td[data-measure]');
			const target = row.dataset.stepTarget ?? '';
			const property = row.dataset.stepProperty ?? '';
			const left = read(before!, target, property);
			const right = read(after!, target, property);
			if (row.dataset.stepScope === 'unavailable') {
				// What the page said before any state showed is kept to say it again when the state goes.
				row.dataset.staticText ??= beforeCell.textContent ?? '';
				if (left === null || right === null) {
					showStatic(row, left === null && right === null ? row.dataset.staticText : `the state is on in the ${left === null ? 'With the recipe' : 'Default'} preview only. Show it in both to compare.`);
					continue;
				}
				beforeCell.colSpan = 1;
				afterCell.hidden = false;
			}
			if (left === null || right === null) {
				beforeCell.textContent = afterCell.textContent = 'no matching element in the example';
			} else if (left === '' || right === '') {
				beforeCell.textContent = afterCell.textContent = 'not measured: the browser reports no value for this property';
			} else {
				beforeCell.textContent = left;
				afterCell.textContent = `${left === right ? 'unchanged' : right}${row.dataset.stepText === 'no-text' ? ' (computed only: no text in the target)' : ''}`;
			}
		}
	}

	// The previews hydrate after the page loads, the theme can change and a reader can open, select or toggle inside a preview: measure
	// again after any of them (and after any change inside a preview), and keep the examples' own headings out of the outline.
	let scheduled = 0;
	const schedule = () => {
		isolateOutline();
		window.clearTimeout(scheduled);
		scheduled = window.setTimeout(() => void measure(), 60);
	};
	schedule();
	const observer = new MutationObserver(schedule);
	for (const pane of panes) observer.observe(pane, { subtree: true, childList: true, attributes: true });
	new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-muxui-color-scheme', 'class'] });
	for (const island of document.querySelectorAll('#styling astro-island')) island.addEventListener('astro:hydrate', schedule);
}

export {};
