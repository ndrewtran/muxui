// The URLs of the scripts the docs build serves under /_muxui/ at a versioned name (see astro.config.mjs).
declare module 'virtual:muxui-served-scripts' {
	/** `/_muxui/styling-measure.<hash of the script>.js`: the page script of the Styling section. */
	export const stylingMeasureUrl: string;
}
