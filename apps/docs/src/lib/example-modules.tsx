import type { ComponentType } from 'react';

type ExampleModule = Record<string, unknown>;

const exampleSourceTexts = import.meta.glob<string>(
	'../../../../catalog/components/*/examples/react/*.tsx',
	{ eager: true, query: '?raw', import: 'default' },
);
const exampleLoaders = import.meta.glob<ExampleModule>(
	'../../../../catalog/components/*/examples/react/*.tsx',
);

function isComponent(value: unknown): value is ComponentType {
  return typeof value === 'function';
}

function sourceEntry(source: string): [string, string] | null {
	return Object.entries(exampleSourceTexts).find(([path]) => path.endsWith(source)) ?? null;
}

function loaderEntry(source: string): [string, () => Promise<ExampleModule>] | null {
	return Object.entries(exampleLoaders).find(([path]) => path.endsWith(source)) ?? null;
}

function executableExportCount(source: string, sourceText: string): number {
	const exports = [...sourceText.matchAll(/^\s*export\s+(?:function|const|default)\b/gmu)];
	if (exports.length !== 1) {
		throw new Error(`The canonical React example must declare exactly one executable export: ${source}`);
	}
	return exports.length;
}

/** Validate the declared source path and exported component during the static build. */
export function assertExampleSource(source: string): void {
	const entry = sourceEntry(source);
	if (!entry) throw new Error(`The canonical React example source could not be found: ${source}`);
	executableExportCount(source, entry[1]);
}

/** Return a lazy loader for one exact canonical source path. */
export function getExampleLoader(source: string): (() => Promise<{ default: ComponentType }>) | null {
	const entry = loaderEntry(source);
	if (!entry) return null;
	return async () => {
		const sourceText = sourceEntry(source)?.[1];
		if (sourceText === undefined) throw new Error(`The canonical React example source could not be found: ${source}`);
		executableExportCount(source, sourceText);
		const module = await entry[1]();
		const components = Object.values(module).filter(isComponent);
		if (components.length !== 1) {
			throw new Error(`The canonical React example module must expose exactly one component: ${source}`);
		}
		return { default: components[0] };
	};
}
