import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { getExampleLoader } from '../../lib/example-modules.tsx';

/** One example's server render, in the shape the styling reference reads (`Observation` of its module). */
export interface ExampleObservation {
	family: string;
	/** The repository-relative example file. */
	source: string;
	html: string;
}

/**
 * Server-renders each of a family's catalog examples with the loader the page already runs them through. The styling reference reads the
 * markup for the element tags, the attributes a render emits and the Rendered DOM block; they are observations of these renders and
 * never a contract. A render that throws fails the build: a Styling section must not be printed from a half-read page.
 */
export async function observeExamples(family: string, examples: readonly { source: { content: string } }[]): Promise<ExampleObservation[]> {
	return Promise.all(examples.map(async ({ source: { content: source } }) => {
		const load = getExampleLoader(source);
		if (load === null) throw new Error(`The canonical React example could not be loaded: ${source}`);
		const { default: Example } = await load();
		return { family, source, html: renderToString(createElement(Example)) };
	}));
}
