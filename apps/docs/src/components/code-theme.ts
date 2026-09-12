import { FOUNDATION_TOKENS } from '../lib/foundations.ts';
import { createTokenPathTransformer } from '../lib/token-path.ts';

type MuxCodeTheme = {
	name: string;
	type: 'dark';
	colors: Record<string, string>;
	settings: { scope: string[]; settings: { foreground: string } }[];
};

export const muxCodeTheme: MuxCodeTheme = {
	name: 'mux-ui',
	type: 'dark',
	colors: {
		'editor.background': 'var(--muxui-semantic-surface-raised)',
		'editor.foreground': 'var(--muxui-semantic-content-default)',
	},
	settings: [
		{
			scope: ['comment', 'punctuation.definition.comment'],
			settings: { foreground: 'var(--muxui-semantic-content-default)' },
		},
		{
			scope: ['string', 'constant.other.symbol', 'entity.name.tag', 'support.class.component'],
			settings: { foreground: 'var(--muxui-semantic-content-strong)' },
		},
		{
			scope: ['keyword', 'storage', 'entity.name.function', 'support.function'],
			settings: { foreground: 'var(--muxui-semantic-content-link)' },
		},
		{
			scope: ['constant.numeric', 'constant.language'],
			settings: { foreground: 'var(--muxui-semantic-content-link)' },
		},
	],
};

export const muxTokenPathTransformer = createTokenPathTransformer(FOUNDATION_TOKENS);
