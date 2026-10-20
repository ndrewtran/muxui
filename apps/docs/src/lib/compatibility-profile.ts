import { reactCompatibility } from '@muxui/react/compatibility';

/**
 * What the React package records about its own testing: the runtime profile, the Node, React and browser versions its
 * checks run against, and what it does not claim. The package generates the record from
 * `catalog/react-r1-5/closure.json` and `packages/react/src/generate.mjs`; Installation shows it and authors none of it.
 */
export interface CompatibilityProfile {
	runtimeProfile: string;
	status: string;
	node: string;
	react: string;
	reactDom: string;
	browser: string;
	axe: string;
	/** Each profile reads color scheme, contrast, motion, density and direction, joined by `/`. */
	displayProfiles: readonly string[];
	/** The repository path of the test that runs the browser matrix. */
	testSource: string;
	notClaimed: readonly string[];
}

function member(parent: unknown, name: string): unknown {
	return typeof parent === 'object' && parent !== null ? Reflect.get(parent, name) : undefined;
}

function text(parent: unknown, name: string): string {
	const found = member(parent, name);
	if (typeof found !== 'string' || found === '') throw new Error(`The React compatibility record has no ${name}.`);
	return found;
}

function textList(parent: unknown, name: string): readonly string[] {
	const found = member(parent, name);
	if (!Array.isArray(found) || found.length === 0 || !found.every((item) => typeof item === 'string' && item !== '')) {
		throw new Error(`The React compatibility record has no ${name} list.`);
	}
	return found;
}

/**
 * Read the profile out of the package's compatibility record. Fails when the record changes shape, or when it no longer
 * states that it claims no assistive-technology support, because the page that shows it says none is claimed.
 */
export function readCompatibilityProfile(record: unknown): CompatibilityProfile {
	const profile = member(record, 'compatibilityProfile');
	const tested = member(profile, 'tested');
	const matrix = member(tested, 'browserMatrix');
	if (member(member(profile, 'assistiveTechnology'), 'claim') !== 'none') {
		throw new Error('The React compatibility record does not state that it claims no assistive-technology support, which the Installation page says.');
	}
	return {
		runtimeProfile: text(profile, 'runtimeProfile'),
		status: text(profile, 'status'),
		node: text(tested, 'node'),
		react: text(tested, 'react'),
		reactDom: text(tested, 'reactDom'),
		browser: text(matrix, 'browser'),
		axe: text(matrix, 'axe'),
		displayProfiles: textList(matrix, 'profiles'),
		testSource: text(matrix, 'source'),
		notClaimed: textList(profile, 'notClaimed'),
	};
}

export const reactCompatibilityProfile = readCompatibilityProfile(reactCompatibility);
