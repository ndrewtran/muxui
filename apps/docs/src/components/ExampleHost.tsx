import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { getExampleLoader } from '../lib/example-modules';

interface ExampleHostProps {
  source: string;
}

export default function ExampleHost({ source }: ExampleHostProps) {
	const Example = getLazyExample(source);
	if (Example === null) {
		throw new Error(`The canonical React example could not be loaded: ${source}`);
	}
	return (
		<Suspense fallback={<div className="example-loading" role="status">Loading example</div>}>
			<Example />
		</Suspense>
	);
}

const lazyExamples = new Map<string, LazyExoticComponent<ComponentType>>();

function getLazyExample(source: string): LazyExoticComponent<ComponentType> | null {
	const existing = lazyExamples.get(source);
	if (existing) return existing;
	const loader = getExampleLoader(source);
	if (!loader) return null;
	const Example = lazy(loader);
	lazyExamples.set(source, Example);
	return Example;
}
