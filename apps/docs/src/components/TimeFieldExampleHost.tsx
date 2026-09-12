import ExampleHost from './ExampleHost';

interface TimeFieldExampleHostProps {
	source: string;
}

export default function TimeFieldExampleHost({ source }: TimeFieldExampleHostProps) {
	return <div data-time-field-example-host style={{ display: 'contents' }}><ExampleHost source={source} /></div>;
}
