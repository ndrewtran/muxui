import React, { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FoundationPage, FoundationToken, TypographyRole } from '../lib/foundations.ts';
import { TokenExpression, TokenPath } from '../lib/token-path.ts';

type FoundationData = {
	sourceId: string;
	themeName: string;
	tokenCount: number;
	tokens: readonly FoundationToken[];
	typographyRoles: readonly TypographyRole[];
	defaultModes: Readonly<Record<string, string>>;
};

interface Props {
	page: FoundationPage;
	data: FoundationData;
}

const CSS_VARIABLE_PREFIX = '--muxui-';

function cssVariable(id: string): string {
	return `${CSS_VARIABLE_PREFIX}${id.replaceAll('.', '-')}`;
}

function cssReference(tokenOrId: FoundationToken | string): string {
	return `var(${typeof tokenOrId === 'string' ? cssVariable(tokenOrId) : tokenOrId.cssName})`;
}

function displayValue(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	if (value === undefined) return '—';
	return JSON.stringify(value);
}

function specimenValue(value: unknown): string {
	if (typeof value !== 'number') return displayValue(value);
	return String(Number(value.toFixed(2)));
}

function styleWithVariables(style: CSSProperties & Record<`--${string}`, string>): CSSProperties {
	return style;
}

function tokenIdForAnchor(id: string): string {
	return `token-${id.replaceAll('.', '-')}`;
}

function foundationRouteForToken(id: string): string {
	if (id.startsWith('reference.')) return 'reference-tokens';
	if (id.startsWith('component.')) return 'component-tokens';
	return 'semantic-tokens';
}

function tokenById(tokens: readonly FoundationToken[], id: string): FoundationToken | undefined {
	return tokens.find((token) => token.id === id);
}

function TokenName({ id, tokens }: { id: string; tokens: readonly FoundationToken[] }) {
	return <TokenPath value={id} token={tokenById(tokens, id)} />;
}

function focusToken(tokenId: string): void {
	const row = document.getElementById(tokenIdForAnchor(tokenId));
	if (row instanceof HTMLButtonElement) row.click();
	row?.scrollIntoView({ block: 'center' });
}

async function copyText(value: string): Promise<boolean> {
	try {
		if (navigator.clipboard) {
			await navigator.clipboard.writeText(value);
			return true;
		}
	} catch {
		// Fall through to the older document API for local docs previews.
	}
	const textarea = document.createElement('textarea');
	textarea.value = value;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	try {
		document.body.append(textarea);
		textarea.select();
		return (document as unknown as { execCommand(commandId: string): boolean }).execCommand('copy');
	} catch {
		return false;
	} finally {
		textarea.remove();
	}
}

function CopyVariableButton({ token }: { token: FoundationToken }) {
	const [status, setStatus] = useState<'idle' | 'success' | 'failure'>('idle');
	const copy = async () => {
		const copied = await copyText(token.cssName);
		setStatus(copied ? 'success' : 'failure');
		window.setTimeout(() => setStatus('idle'), 1400);
	};
	return <button type="button" className="foundation-copy" onClick={copy} aria-label={`Copy ${token.cssName}`}>
		{status === 'success' ? 'Copied' : status === 'failure' ? 'Copy failed' : 'Copy variable'}
	</button>;
}

function useAppliedTokenValue(token: FoundationToken | undefined): string {
	const [value, setValue] = useState('Reading applied value…');
	useEffect(() => {
		if (!token) return undefined;
		const update = () => {
			const computed = getComputedStyle(document.documentElement).getPropertyValue(token.cssName).trim();
			setValue(computed || 'Not currently exposed on this page');
		};
		update();
		window.addEventListener('muxui:theme-status', update);
		const observer = new MutationObserver(update);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-muxui-color-scheme', 'data-muxui-density', 'data-muxui-motion'] });
		return () => {
			window.removeEventListener('muxui:theme-status', update);
			observer.disconnect();
		};
	}, [token]);
	return value;
}

function TokenDetail({ token, tokens }: { token: FoundationToken | undefined; tokens: readonly FoundationToken[] }) {
	const appliedValue = useAppliedTokenValue(token);
	if (!token) return <aside className="foundation-detail" aria-label="Token details">Select a token to inspect its values.</aside>;
	return <aside className="foundation-detail" aria-labelledby="foundation-detail-title">
		<div className="foundation-detail-heading">
			<div>
				<p className="foundation-eyebrow">Selected token</p>
				<h3 id="foundation-detail-title"><TokenPath value={token.id} token={token} /></h3>
			</div>
			<CopyVariableButton token={token} />
		</div>
		<p>{token.meaning}</p>
		<dl className="foundation-detail-list">
			<div><dt>CSS variable</dt><dd><code><TokenPath value={token.cssName} token={token} /></code></dd></div>
			<div><dt>Type</dt><dd>{token.type} · {token.unit}</dd></div>
			<div><dt>Override</dt><dd>{token.overridePolicy}</dd></div>
			<div><dt>Resolution</dt><dd>{token.sourceKind}</dd></div>
			<div><dt>Canonical alias chain</dt><dd className="foundation-chain">
				{token.aliasChain.map((id, index) => <React.Fragment key={id}>
					{index > 0 ? <span aria-hidden="true">→</span> : null}
					<a href={`/foundations/${foundationRouteForToken(id)}/#${tokenIdForAnchor(id)}`}><TokenPath value={id} token={tokenById(tokens, id)} /></a>
				</React.Fragment>)}
			</dd></div>
			{token.dependencies.length > 0 && token.sourceKind !== 'alias' ? <div><dt>Computed dependencies</dt><dd className="foundation-chain">
				{token.dependencies.map((id, index) => <React.Fragment key={id}>
					{index > 0 ? <span aria-hidden="true">·</span> : null}
					<a href={`/foundations/${foundationRouteForToken(id)}/#${tokenIdForAnchor(id)}`}><TokenPath value={id} token={tokenById(tokens, id)} /></a>
				</React.Fragment>)}
			</dd></div> : null}
		</dl>
		<div className="foundation-value-grid">
			<div><span>Default resolved</span><code>{displayValue(token.defaultValue)}</code></div>
			<div><span>Default CSS</span><code><TokenExpression value={token.defaultCssValue} tokens={tokens} /></code></div>
			<div><span>Current applied</span><code data-applied-value><TokenExpression value={appliedValue} tokens={tokens} /></code></div>
		</div>
		<pre className="foundation-inline-code"><code><TokenExpression value={token.defaultDeclaration} tokens={tokens} /></code></pre>
	</aside>;
}

function TokenInventory({
	tokens,
	allTokens,
	initialToken,
	title = 'Token inventory',
	description = 'Search the complete canonical set for this page.',
}: {
	tokens: readonly FoundationToken[];
	allTokens: readonly FoundationToken[];
	initialToken?: FoundationToken;
	title?: string;
	description?: string;
}) {
	const [query, setQuery] = useState('');
	const [type, setType] = useState('all');
	const [selectedId, setSelectedId] = useState(initialToken?.id ?? tokens[0]?.id);
	const types = useMemo(() => [...new Set(tokens.map((token) => token.type))].sort(), [tokens]);
	const filtered = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		return tokens.filter((token) => (type === 'all' || token.type === type)
			&& (!normalized || `${token.id} ${token.cssName} ${token.meaning}`.toLowerCase().includes(normalized)));
	}, [query, tokens, type]);
	const selected = tokenById(tokens, selectedId ?? '') ?? filtered[0] ?? tokens[0];
	const tokenFromHash = () => {
		const hash = window.location.hash.slice(1);
		const token = tokens.find((item) => tokenIdForAnchor(item.id) === hash);
		if (!token) return;
		setSelectedId(token.id);
		window.requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: 'center' }));
	};
	useEffect(() => {
		tokenFromHash();
		window.addEventListener('hashchange', tokenFromHash);
		return () => window.removeEventListener('hashchange', tokenFromHash);
	}, [tokens]);
	return <section className="foundation-section foundation-inventory" aria-labelledby={`${title.replaceAll(' ', '-').toLowerCase()}-title`}>
		<div className="foundation-section-heading">
			<div>
				<h2 id={`${title.replaceAll(' ', '-').toLowerCase()}-title`}>{title}</h2>
				<p>{description} <span className="foundation-count">{tokens.length} tokens</span></p>
			</div>
			<div className="foundation-filters">
				<label><span>Search</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, variable, meaning" /></label>
				<label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option>{types.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
			</div>
		</div>
		<div className="foundation-inventory-layout">
			<ul className="foundation-token-list" aria-label={`${title} results`}>
				{filtered.length === 0 ? <li className="foundation-empty">No tokens match this filter.</li> : filtered.map((token) => (
					<li key={token.id}>
						<button
							type="button"
							className={`foundation-token-row${selected?.id === token.id ? ' is-selected' : ''}`}
							id={tokenIdForAnchor(token.id)}
							data-token-id={token.id}
							onClick={() => setSelectedId(token.id)}
						>
							<span className="foundation-token-row-name"><code><TokenPath value={token.id} token={token} /></code><small>{token.meaning}</small></span>
							<span className="foundation-token-row-value">{displayValue(token.defaultValue)}</span>
						</button>
					</li>
				))}
			</ul>
			<TokenDetail token={selected} tokens={allTokens} />
		</div>
	</section>;
}

function SectionIntro({ title, children }: { title: string; children: React.ReactNode }) {
	return <div className="foundation-section-intro"><h2>{title}</h2><p>{children}</p></div>;
}

function TokenLegend() {
	return <div className="foundation-token-legend" role="note" aria-label="Token path colour key">
		<span className="foundation-token-legend-title">Path key</span>
		<span><i className="mux-token-path__segment mux-token-path__segment--layer-reference">reference</i> layer</span>
		<span><i className="mux-token-path__segment mux-token-path__segment--layer-semantic">semantic</i> layer</span>
		<span><i className="mux-token-path__segment mux-token-path__segment--layer-component">component</i> layer</span>
		<span><i className="mux-token-path__segment mux-token-path__segment--category">color</i> category / type</span>
		<span><i className="mux-token-path__segment mux-token-path__segment--property">property</i> · <i className="mux-token-path__segment mux-token-path__segment--scale">scale</i> · <i className="mux-token-path__segment mux-token-path__segment--state">state</i></span>
	</div>;
}

function Overview({ data }: { data: FoundationData }) {
	const counts = (page: FoundationPage) => {
		if (page.layer) return data.tokens.filter((token) => token.layer === page.layer).length;
		const matches = page.category === 'colour'
			? (token: FoundationToken) => token.type === 'color'
			: page.category === 'typography'
				? (token: FoundationToken) => token.id.includes('.typography.') || token.id.startsWith('reference.number.font-weight') || token.id.startsWith('reference.dimension.font-size-') || token.id.startsWith('reference.dimension.text-') || token.id.startsWith('reference.number.line-height-')
				: page.category === 'spacing'
					? (token: FoundationToken) => token.type === 'dimension'
					: page.category === 'shape'
						? (token: FoundationToken) => token.id.startsWith('reference.dimension.radius-') || token.id.startsWith('semantic.shape.')
						: page.category === 'elevation'
							? (token: FoundationToken) => token.type === 'effect'
							: (token: FoundationToken) => token.type === 'duration' || token.id.includes('.motion.');
		return data.tokens.filter(matches).length;
	};
	return <div className="foundation-page foundation-overview">
		<div className="foundation-lede">
			<p className="foundation-eyebrow">Mux UI · {data.themeName} theme</p>
			<p>Foundations turn a shared vocabulary into visible interface decisions. Start with the reference scales, follow their semantic roles, then inspect component-owned escape hatches.</p>
			<div className="foundation-link-row"><a href="/themes/">Themes &amp; tokens</a><a href="/scale/">Open Scale</a><span>{data.tokenCount} canonical tokens · source <code>{data.sourceId}</code></span></div>
		</div>
		<section className="foundation-section" aria-labelledby="foundation-layers-title">
			<div className="foundation-section-heading"><div><h2 id="foundation-layers-title">The token system</h2><p>Each layer answers a different question. Keep product code on semantic roles unless a component contract says otherwise.</p></div><span className="foundation-mode-readout">Default: {data.defaultModes.colorScheme} · {data.defaultModes.density}</span></div>
			<div className="foundation-layer-flow" aria-label="Reference to semantic to component token progression">
				{[['Reference', 'reference', 'Stable values and primitives'], ['Semantic', 'semantic', 'Roles used by interface states'], ['Component', 'component', 'Public customization points']].map(([label, layer, description], index) => <React.Fragment key={layer}>
					{index > 0 ? <span className="foundation-flow-arrow" aria-hidden="true">→</span> : null}
					<div className="foundation-layer-step"><span className="foundation-step-index">0{index + 1}</span><strong>{label}</strong><span>{description}</span><small>{data.tokens.filter((token) => token.layer === layer).length} tokens</small></div>
				</React.Fragment>)}
			</div>
		</section>
		<section className="foundation-section" aria-labelledby="foundation-pages-title">
			<h2 id="foundation-pages-title">Explore by purpose</h2>
			<div className="foundation-page-grid">{FOUNDATION_LINKS.map((item) => <a className="foundation-page-link" href={`/foundations/${item.slug}/`} key={item.slug}><span className="foundation-eyebrow">{item.label}</span><strong>{item.title}</strong><span>{item.description}</span><small>{counts(item)} canonical tokens</small></a>)}</div>
		</section>
		<p className="foundation-source-note">Facts on these pages are projected from <code>catalog/tokens/default-theme.json</code>. The displayed applied value is read from the site’s active custom properties and can change when a Scale theme is applied.</p>
	</div>;
}

const FOUNDATION_LINKS: readonly FoundationPage[] = [
	{ slug: 'reference-tokens', label: 'Layer 01', title: 'Reference tokens', description: 'Stable primitives for colour, dimensions, type, motion, and effects.', kind: 'layer', layer: 'reference' },
	{ slug: 'semantic-tokens', label: 'Layer 02', title: 'Semantic tokens', description: 'Interface roles for content, surfaces, actions, states, and layout.', kind: 'layer', layer: 'semantic' },
	{ slug: 'colour', label: 'Category', title: 'Colour', description: 'Full canonical ramps plus role-based interface colour specimens.', kind: 'category', category: 'colour' },
	{ slug: 'typography', label: 'Category', title: 'Typography', description: 'Real type specimens mapped to the theme’s role and variant graph.', kind: 'category', category: 'typography' },
	{ slug: 'spacing', label: 'Category', title: 'Spacing and dimensions', description: 'Rulers, gaps, insets, control sizing, and the complete dimension inventory.', kind: 'category', category: 'spacing' },
	{ slug: 'shape', label: 'Category', title: 'Shape', description: 'Equal-size corner specimens for reference and semantic radius roles.', kind: 'category', category: 'shape' },
	{ slug: 'elevation', label: 'Category', title: 'Elevation and effects', description: 'Typed shadows and equal-size surfaces at each depth level.', kind: 'category', category: 'elevation' },
	{ slug: 'motion', label: 'Category', title: 'Motion', description: 'User-triggered timing and easing replays with reduced-motion safety.', kind: 'category', category: 'motion' },
	{ slug: 'component-tokens', label: 'Layer 03', title: 'Component tokens', description: 'Component-owned aliases with honest property previews.', kind: 'layer', layer: 'component' },
];

function ColorRamp({ family, tokens }: { family: string; tokens: readonly FoundationToken[] }) {
	return <div className="foundation-color-ramp"><div className="foundation-ramp-heading"><strong>{family}</strong><span>{tokens.length} steps</span></div><div className="foundation-ramp-grid">{tokens.map((token) => <button className="foundation-swatch" data-swatch-id={token.id} type="button" key={token.id} style={{ backgroundColor: cssReference(token) }} title={`Inspect ${token.id}`} onClick={() => focusToken(token.id)}><span>{token.id.split('-').at(-1)}</span><small>{token.defaultValue as string}</small></button>)}</div></div>;
}

function cssNumber(value: string, scale = 1): number {
	const parsed = Number.parseFloat(value);
	return value.trim().endsWith('%') ? parsed * scale / 100 : parsed * scale;
}

function cssRgbChannel(value: string): number {
	const parsed = Number.parseFloat(value);
	return value.trim().endsWith('%') ? parsed * 2.55 : parsed;
}

function parseCssColor(value: string): readonly [number, number, number] | undefined {
	const rgb = value.match(/^rgba?\(([^)]+)\)/u);
	if (rgb) {
		const channels = rgb[1].trim().split(/[\s,\/]+/u).slice(0, 3).map(cssRgbChannel);
		return channels.length === 3 && channels.every(Number.isFinite) ? channels as [number, number, number] : undefined;
	}
	const srgb = value.match(/^color\(srgb\s+([^\s]+)\s+([^\s]+)\s+([^\s/]+)(?:\s*\/[^)]+)?\)/u);
	if (srgb) return [cssNumber(srgb[1], 255), cssNumber(srgb[2], 255), cssNumber(srgb[3], 255)];
	const oklch = value.match(/^oklch\(\s*([^\s]+)\s+([^\s]+)\s+([^\s/]+)(?:\s*\/[^)]+)?\)/u);
	if (!oklch) return undefined;
	const lightness = cssNumber(oklch[1], 1);
	const chroma = oklch[2].endsWith('%') ? cssNumber(oklch[2], 0.4) : Number.parseFloat(oklch[2]);
	const hueValue = Number.parseFloat(oklch[3]);
	const hue = oklch[3].endsWith('turn') ? hueValue * Math.PI * 2 : oklch[3].endsWith('rad') ? hueValue : hueValue * Math.PI / 180;
	const a = chroma * Math.cos(hue);
	const b = chroma * Math.sin(hue);
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const linear = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
	return linear.map((channel) => 255 * (channel <= 0.0031308 ? 12.92 * channel : 1.055 * (Math.max(channel, 0) ** (1 / 2.4)) - 0.055)) as [number, number, number];
}

function useSwatchContrast() {
	useEffect(() => {
		const refresh = () => {
			document.querySelectorAll<HTMLElement>('[data-swatch-id]').forEach((element) => {
			const channels = parseCssColor(getComputedStyle(element).backgroundColor);
			if (!channels) return;
			const luminance = channels.map((channel) => channel / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
			const contrast = luminance > 0.179 ? 'dark' : 'light';
			element.dataset.contrast = contrast;
			element.style.color = contrast === 'dark' ? '#000' : '#fff';
			});
			document.querySelectorAll<HTMLElement>('[data-role-id]').forEach((element) => {
			const channels = parseCssColor(getComputedStyle(element).backgroundColor);
			if (!channels) return;
			const luminance = channels.map((channel) => channel / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
			const contrast = luminance > 0.179 ? 'dark' : 'light';
			element.dataset.contrast = contrast;
			element.style.color = contrast === 'dark' ? '#000' : '#fff';
			});
		};
		refresh();
		window.addEventListener('muxui:theme-status', refresh);
		return () => window.removeEventListener('muxui:theme-status', refresh);
	}, []);
}

function ColorPage({ data }: { data: FoundationData }) {
	useSwatchContrast();
	const colors = data.tokens.filter((token) => token.type === 'color');
	const ramps = useMemo(() => {
		const groups = new Map<string, FoundationToken[]>();
		for (const token of colors.filter((item) => item.id.startsWith('reference.color.'))) {
			const match = token.id.match(/^reference\.color\.(.+)-(\d+)$/u);
			if (!match) continue;
			const family = match[1];
			const entries = groups.get(family) ?? [];
			entries.push(token);
			groups.set(family, entries);
		}
		return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([family, entries]) => [family, entries.sort((left, right) => Number(left.id.match(/(\d+)$/u)?.[1]) - Number(right.id.match(/(\d+)$/u)?.[1]))] as const);
	}, [colors]);
	const roles = ['semantic.surface.canvas', 'semantic.surface.background', 'semantic.content.default', 'semantic.content.link', 'semantic.action.background', 'semantic.status.success', 'semantic.feedback.invalid'].map((id) => tokenById(colors, id)).filter((token): token is FoundationToken => token !== undefined);
	return <div className="foundation-page"><SectionIntro title="Palette ramps">Every ramp below is derived from the canonical source, including its actual number of stops. Use a reference colour to build a role; use a semantic role when you need interface meaning.</SectionIntro><section className="foundation-section"><div className="foundation-section-heading"><div><h2>Reference ramps</h2><p>{ramps.reduce((sum, [, entries]) => sum + entries.length, 0)} ramp entries across {ramps.length} families.</p></div><span className="foundation-legend">Swatches follow the active theme. Hex labels show canonical defaults.</span></div><div className="foundation-ramps">{ramps.map(([family, entries]) => <ColorRamp key={family} family={family} tokens={entries} />)}</div></section><section className="foundation-section foundation-role-strip"><h2>Interface roles</h2><div className="foundation-role-grid">{roles.map((token) => <div className="foundation-role" data-role-id={token.id} key={token.id} style={styleWithVariables({ backgroundColor: cssReference(token) })}><span>{token.id.replace('semantic.', '')}</span><code>{token.defaultValue as string}</code></div>)}</div></section><TokenInventory tokens={colors} allTokens={data.tokens} title="Colour token inventory" description="Search all canonical colour tokens, including ramps, semantic roles, and component aliases." /></div>;
}

function TypographyPage({ data }: { data: FoundationData }) {
	const typographyTokens = data.tokens.filter((token) => token.id.includes('.typography.') || token.id.startsWith('reference.number.font-weight') || token.id.startsWith('reference.dimension.font-size-') || token.id.startsWith('reference.dimension.text-') || token.id.startsWith('reference.number.line-height-'));
	const referenceSizes = typographyTokens.filter((token) => token.id.startsWith('reference.dimension.font-size-') || token.id.startsWith('reference.dimension.text-')).sort((left, right) => Number(left.defaultValue) - Number(right.defaultValue));
	return <div className="foundation-page"><SectionIntro title="Typography specimens">Typography roles connect a family, colour, size, weight, leading, and tracking. Read the sample at its real scale, then inspect the token graph below.</SectionIntro><section className="foundation-section"><div className="foundation-type-specimens">{data.typographyRoles.map((role) => <div className="foundation-type-role" key={role.name}><div className="foundation-type-role-heading"><h2>{role.name}</h2><code><TokenName id={role.fontFamily} tokens={data.tokens} /></code></div>{role.variants.map((variant) => <div className="foundation-type-sample" key={variant.name}><div className="foundation-type-meta"><span>{variant.name}</span><code><TokenName id={variant.fontSize} tokens={data.tokens} /></code></div><p style={styleWithVariables({ fontFamily: cssReference(role.fontFamily), color: cssReference(role.color), fontSize: cssReference(variant.fontSize), fontWeight: cssReference(variant.fontWeight), lineHeight: cssReference(variant.lineHeight), letterSpacing: cssReference(variant.letterSpacing) })}>Design systems become useful when their decisions can be felt in the interface.</p></div>)}</div>)}</div></section><section className="foundation-section"><h2>Reference type scale</h2><p className="foundation-section-note">These canonical font-size references are rendered at their actual size; the inventory below also includes weight, leading, tracking, and text aliases.</p><div className="foundation-reference-type-scale">{referenceSizes.map((token) => <div className="foundation-reference-type-row" key={token.id}><code><TokenPath value={token.id} token={token} /></code><span style={{ fontSize: cssReference(token) }}>Aa</span><small>{specimenValue(token.defaultValue)} {token.unit}</small></div>)}</div></section><TokenInventory tokens={typographyTokens} allTokens={data.tokens} title="Typography token inventory" description="Search the complete set of canonical type family, size, weight, leading, tracking, and reference scale tokens." /></div>;
}

function SpacingPage({ data }: { data: FoundationData }) {
	const dimensions = data.tokens.filter((token) => token.type === 'dimension');
	const rulerTokens = dimensions
		.filter((token) => /(?:reference\.dimension\.(?:space|section-space)-|semantic\.(?:layout|control)\.)/u.test(token.id))
		.sort((left, right) => Number(left.defaultValue) - Number(right.defaultValue));
	const sizing = ['semantic.control.size-sm', 'semantic.control.size-md', 'semantic.control.size-lg']
		.map((id) => tokenById(dimensions, id))
		.filter((token): token is FoundationToken => token !== undefined);
	const gaps = dimensions.filter((token) => token.id.includes('gap'));
	const paddingExamples = [
		{ id: 'semantic.control.padding-inline', label: 'Inline padding', property: 'paddingInline' },
		{ id: 'semantic.control.padding-block', label: 'Block padding', property: 'paddingBlock' },
		{ id: 'semantic.layout.control-inset', label: 'Control inset', property: 'padding' },
		{ id: 'semantic.layout.navigation-search-inset', label: 'Search start inset', property: 'paddingInlineStart' },
		{ id: 'semantic.layout.search-clear-inset', label: 'Clear end inset', property: 'paddingInlineEnd' },
		{ id: 'component.button.padding-inline', label: 'Button inline padding', property: 'paddingInline' },
	] as const;
	const metricList = (title: string, tokens: readonly FoundationToken[]) => <div className="foundation-metric-group"><h3>{title}</h3><div className="foundation-metric-list">{tokens.map((token) => <div className="foundation-metric" key={token.id}><div className="foundation-metric-copy"><code><TokenPath value={token.id} token={token} /></code><span>{specimenValue(token.defaultValue)} {token.unit}</span></div><div className="foundation-gap-preview" data-metric-token={token.id} style={{ gap: cssReference(token) }}><span /><span /></div></div>)}</div></div>;
	return <div className="foundation-page"><SectionIntro title="Spacing and dimensions">The ruler uses canonical variables for its visual width, so the specimen responds to active Scale values. The inventory remains complete, including dimensions that are not suited to a ruler.</SectionIntro><section className="foundation-section"><h2>Ruler</h2><div className="foundation-ruler">{rulerTokens.map((token) => <div className="foundation-ruler-row" key={token.id}><code>{token.id.replace(/^.*\./u, '')}</code><div className="foundation-ruler-track"><span style={{ width: `min(100%, ${cssReference(token)})` }} /></div><small>{specimenValue(token.defaultValue)} {token.unit}</small></div>)}</div></section><section className="foundation-section"><div className="foundation-section-heading"><div><h2>Control sizing</h2><p>These are the canonical 32 / 36 / 40 px control heights. Padding and gap roles are shown separately below.</p></div></div><div className="foundation-size-grid">{sizing.map((token) => <div className="foundation-size-specimen" key={token.id}><div className="foundation-size-control" style={{ minHeight: cssReference(token), paddingInline: cssReference('semantic.control.padding-inline') }}><span>Control</span></div><code><TokenPath value={token.id} token={token} /></code><small>{specimenValue(token.defaultValue)} {token.unit}</small></div>)}</div></section><section className="foundation-section"><h2>Padding and inset examples</h2><p className="foundation-section-note">Each preview applies the named property directly. Other canonical dimensions and insets remain available in the ruler and inventory.</p><div className="foundation-padding-example-list">{paddingExamples.map(({ id, label, property }) => { const token = tokenById(dimensions, id); if (!token) return null; const style = { [property]: cssReference(token) }; return <div className="foundation-padding-example" key={id}><div className="foundation-metric-copy"><strong>{label}</strong><code><TokenPath value={id} token={token} /></code><span>{specimenValue(token.defaultValue)} {token.unit}</span></div><div className="foundation-padding-preview" data-metric-token={id} data-padding-property={property} style={style}><span aria-hidden="true" /></div></div>; })}</div></section><section className="foundation-section">{metricList('Gap examples', gaps)}</section><TokenInventory tokens={dimensions} allTokens={data.tokens} title="Dimension inventory" description="Search every canonical dimension, including spacing, insets, type sizes, radii, and control metrics." /></div>;
}

function ShapePage({ data }: { data: FoundationData }) {
	const shapes = data.tokens.filter((token) => token.id.startsWith('reference.dimension.radius-') || token.id.startsWith('semantic.shape.')).sort((left, right) => Number(left.defaultValue) - Number(right.defaultValue));
	return <div className="foundation-page"><SectionIntro title="Corner hierarchy">Each specimen has the same 5rem square footprint. Only its radius changes, making the intended hierarchy visible without confounding size.</SectionIntro><section className="foundation-section"><div className="foundation-shape-grid">{shapes.map((token) => <div className="foundation-shape-specimen" key={token.id}><div className="foundation-shape-box" style={{ borderRadius: cssReference(token) }}><span>Ag</span></div><code><TokenPath value={token.id} token={token} /></code><small>{specimenValue(token.defaultValue)} {token.unit}</small></div>)}</div></section><TokenInventory tokens={shapes} allTokens={data.tokens} title="Shape token inventory" description="Search all canonical reference radii and semantic shape roles." /></div>;
}

function ElevationPage({ data }: { data: FoundationData }) {
	const effects = data.tokens.filter((token) => token.type === 'effect');
	return <div className="foundation-page"><SectionIntro title="Depth as a role">Effects are typed shadow values, not anonymous decoration. These equal-size surfaces show how the reference shadow primitives resolve into semantic elevation roles.</SectionIntro><section className="foundation-section"><div className="foundation-elevation-grid">{effects.map((token) => <div className="foundation-elevation-specimen" key={token.id}><div className="foundation-surface" style={{ boxShadow: cssReference(token) }}><span>{token.id.split('.').at(-1)}</span></div><code><TokenPath value={token.id} token={token} /></code><small><TokenExpression value={token.defaultCssValue} tokens={data.tokens} /></small></div>)}</div></section><TokenInventory tokens={effects} allTokens={data.tokens} title="Effect inventory" description="Search every canonical typed effect, including reference shadows and semantic elevation roles." /></div>;
}

type MotionTimingGroup = {
	id: string;
	title: string;
	description: string;
	tokens: readonly FoundationToken[];
};

function titleCaseMotionLabel(value: string): string {
	return value.split('-').map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ');
}

function motionTimingLabel(token: FoundationToken): string {
	const leaf = token.id.split('.').at(-1) ?? token.id;
	const withoutDuration = leaf.replace(/^duration-/u, '').replace(/-duration$/u, '');
	return withoutDuration === 'feedback' ? 'Feedback role' : titleCaseMotionLabel(withoutDuration);
}

function motionTimingScope(token: FoundationToken): string {
	if (token.id.startsWith('reference.duration.')) return 'Reference scale';
	if (token.id.startsWith('reference.motion.')) return 'Motion reference';
	return 'Semantic role';
}

function sortMotionTimings(tokens: readonly FoundationToken[]): readonly FoundationToken[] {
	return [...tokens].sort((left, right) => {
		const leftValue = Number(left.defaultValue);
		const rightValue = Number(right.defaultValue);
		const valueOrder = leftValue - rightValue;
		if (valueOrder !== 0) return valueOrder;
		return motionTimingLabel(left).localeCompare(motionTimingLabel(right)) || left.id.localeCompare(right.id);
	});
}

function motionTimingGroups(durations: readonly FoundationToken[]): readonly MotionTimingGroup[] {
	const entryPattern = /^semantic\.motion\.(?:selection-enter|panel-enter|reveal|content-resize|enter|exit|content)-duration$/u;
	return [
		{
			id: 'reference',
			title: 'Reference speed scale',
			description: 'Base speeds, from instant to deliberate.',
			tokens: durations.filter((token) => token.layer === 'reference'),
		},
		{
			id: 'feedback',
			title: 'Feedback and control changes',
			description: 'Short feedback, control state changes, and mode switches.',
			tokens: durations.filter((token) => token.layer !== 'reference' && !token.id.startsWith('semantic.motion.progress-') && !entryPattern.test(token.id)),
		},
		{
			id: 'entry',
			title: 'Entry and content transitions',
			description: 'Entering, leaving, revealing, and resizing content.',
			tokens: durations.filter((token) => entryPattern.test(token.id)),
		},
		{
			id: 'progress',
			title: 'Progress timings',
			description: 'Value updates and longer progress cycles. Each replay runs once.',
			tokens: durations.filter((token) => token.id.startsWith('semantic.motion.progress-')),
		},
	].map((group) => ({ ...group, tokens: sortMotionTimings(group.tokens) }));
}

function MotionTimingEntry({ token, replay, allTokens }: { token: FoundationToken; replay: number; allTokens: readonly FoundationToken[] }) {
	return <div className="foundation-timing">
		<div className="foundation-timing-meta"><strong>{motionTimingLabel(token)}</strong><small>{motionTimingScope(token)}</small></div>
		<span className="foundation-timing-sample" key={`${token.id}-${replay}`} style={{ animationName: replay ? 'foundation-timing-replay' : 'none', animationDuration: cssReference(token) }}>Aa</span>
		<code><TokenPath value={token.id} token={token} /></code>
		{token.authoredAlias ? <small className="foundation-timing-alias">Alias to <a href={`/foundations/${foundationRouteForToken(token.authoredAlias)}/#${tokenIdForAnchor(token.authoredAlias)}`}><TokenName id={token.authoredAlias} tokens={allTokens} /></a></small> : null}
		<code className="foundation-timing-value">{displayValue(token.defaultValue)} {token.unit}</code>
	</div>;
}

function MotionTimingGroup({ group, replay, allTokens, onReplay }: { group: MotionTimingGroup; replay: number; allTokens: readonly FoundationToken[]; onReplay: () => void }) {
	const headingId = `foundation-timing-group-${group.id}`;
	return <section className="foundation-timing-group" aria-labelledby={headingId}>
		<div className="foundation-section-heading foundation-timing-group-heading">
			<div><h3 id={headingId}>{group.title}</h3><p>{group.description}</p></div>
			<button type="button" className="foundation-action" onClick={onReplay}>Replay motion</button>
		</div>
		<div className="foundation-timing-grid">{group.tokens.map((token) => <MotionTimingEntry key={token.id} token={token} replay={replay} allTokens={allTokens} />)}</div>
	</section>;
}

function MotionPage({ data }: { data: FoundationData }) {
	const durations = data.tokens.filter((token) => token.type === 'duration');
	const easings = data.tokens.filter((token) => token.id.includes('.motion.') && token.type === 'string');
	const [replay, setReplay] = useState(0);
	const groups = motionTimingGroups(durations);
	const replayMotion = () => setReplay((value) => value + 1);
	return <div className="foundation-page">
		<SectionIntro title="Finite and intentional">Motion specimens replay only after a user action. The same custom properties drive duration and easing, while the reduced-motion mode collapses the animation to an instant state.</SectionIntro>
		<section className="foundation-section foundation-motion-section">
			<div className="foundation-section-heading">
				<div><h2>Easing plot</h2><p>Replay a single transition to compare the canonical easing roles.</p></div>
				<button type="button" className="foundation-action" onClick={replayMotion}>Replay motion</button>
			</div>
			<div className="foundation-motion-plot">{easings.map((easing) => {
				const durationId = easing.id.replace(/-easing$/u, '-duration');
				const duration = durations.find((token) => token.id === durationId) ?? durations.find((token) => token.id.includes('duration-fast'));
				return <div className="foundation-motion-row" key={easing.id}><code><TokenName id={easing.id} tokens={data.tokens} /></code><div className="foundation-motion-track"><span className="foundation-motion-marker" key={`${easing.id}-${replay}`} style={{ animationName: replay ? 'foundation-motion-replay' : 'none', animationDuration: cssReference(duration ?? 'reference.duration.fast'), animationTimingFunction: cssReference(easing) }} /></div><small>{displayValue(easing.defaultValue)}</small></div>;
			})}</div>
		</section>
		<section className="foundation-section foundation-timing-section" aria-labelledby="foundation-timing-roles-title">
			<div className="foundation-section-heading">
				<div><h2 id="foundation-timing-roles-title">Timing roles</h2><p>Replay the same finite motion to see each duration at its canonical scale.</p></div>
				<button type="button" className="foundation-action" onClick={replayMotion}>Replay motion</button>
			</div>
			<div className="foundation-timing-groups">{groups.map((group) => <MotionTimingGroup key={group.id} group={group} replay={replay} allTokens={data.tokens} onReplay={replayMotion} />)}</div>
		</section>
		<TokenInventory tokens={[...durations, ...easings]} allTokens={data.tokens} title="Motion token inventory" description="Search all canonical duration and easing tokens, including mode-aware semantic roles." />
	</div>;
}

function ComponentTokensPage({ data }: { data: FoundationData }) {
	const components = data.tokens.filter((token) => token.layer === 'component');
	const button = (name: string) => tokenById(components, `component.button.${name}`);
	const background = button('background');
	const foreground = button('foreground');
	const height = button('min-height');
	const padding = button('padding-inline');
	const radius = button('radius');
	return <div className="foundation-page"><SectionIntro title="Owned by the component contract">Component tokens are intentionally sparse. They name public customization points and alias semantic roles, so usage remains legible in both the component and foundation docs.</SectionIntro><section className="foundation-section"><div className="foundation-component-preview"><div className="foundation-component-button-wrap"><span className="foundation-component-button" style={{ backgroundColor: cssReference(background ?? 'semantic.action.background'), color: cssReference(foreground ?? 'semantic.action.foreground'), minHeight: cssReference(height ?? 'semantic.control.min-height'), paddingInline: cssReference(padding ?? 'semantic.control.padding-inline'), borderRadius: cssReference(radius ?? 'semantic.control.radius') }}>Save changes</span></div><div><p className="foundation-eyebrow">Property preview</p><p>This visual sample inherits the applied site values. The component tokens below point back to their semantic usage roles.</p></div></div></section><section className="foundation-section"><div className="foundation-component-list">{components.map((token) => <div className="foundation-component-row" key={token.id}><div><code><TokenPath value={token.id} token={token} /></code><p>{token.meaning}</p></div><div className="foundation-component-alias">{token.authoredAlias ? <><span>Alias to</span><a href={`/foundations/semantic-tokens/#${tokenIdForAnchor(token.authoredAlias)}`}><TokenName id={token.authoredAlias} tokens={data.tokens} /></a></> : <span>Literal component value</span>}<code><TokenPath value={token.cssName} token={token} /></code></div><CopyVariableButton token={token} /></div>)}</div></section><TokenInventory tokens={components} allTokens={data.tokens} title="Component token inventory" description="Search the complete component-owned inventory and inspect each alias chain." /></div>;
}

function LayerExample({ data }: { data: FoundationData }) {
	const reference = tokenById(data.tokens, 'reference.color.brand-60');
	const semantic = tokenById(data.tokens, 'semantic.action.background');
	const component = tokenById(data.tokens, 'component.button.background');
	const foreground = tokenById(data.tokens, 'component.button.foreground');
	const entries = [
		{ label: 'Reference', token: reference, preview: <div className="foundation-layer-example-swatch" style={{ backgroundColor: cssReference(reference ?? 'reference.color.brand-60') }} /> },
		{ label: 'Semantic', token: semantic, preview: <div className="foundation-layer-example-role" style={{ backgroundColor: cssReference(semantic ?? 'semantic.action.background') }}>Action</div> },
		{ label: 'Component', token: component, preview: <span className="foundation-layer-example-button" style={{ backgroundColor: cssReference(component ?? 'component.button.background'), color: cssReference(foreground ?? 'component.button.foreground') }}>Save</span> },
	];
	return <section className="foundation-section foundation-layer-example" aria-labelledby="foundation-layer-example-title"><div className="foundation-section-heading"><div><h2 id="foundation-layer-example-title">One decision across the layers</h2><p>Reference values become semantic roles, then component-owned properties. These previews inherit the active site variables.</p></div></div><div className="foundation-layer-example-grid">{entries.map(({ label, token, preview }) => <div className="foundation-layer-example-step" key={label}><span className="foundation-eyebrow">{label}</span>{preview}<a href={`/foundations/${foundationRouteForToken(token?.id ?? '')}/#${tokenIdForAnchor(token?.id ?? '')}`}><code>{token ? <TokenPath value={token.id} token={token} /> : null}</code></a></div>)}</div></section>;
}

function LayerPage({ page, data }: { page: FoundationPage; data: FoundationData }) {
	const tokens = data.tokens.filter((token) => token.layer === page.layer);
	const first = tokens[0];
	return <div className="foundation-page"><SectionIntro title={page.title}>{page.description} Use the filters to reach every token in this layer; selecting a row exposes its canonical chain, default resolution, and current applied value.</SectionIntro><LayerExample data={data} /><TokenInventory tokens={tokens} allTokens={data.tokens} initialToken={first} title={`${page.title} inventory`} description="Search the complete canonical layer." /></div>;
}

export default function FoundationExplorer({ page, data }: Props) {
	let content: React.ReactNode;
	if (page.kind === 'overview') content = <Overview data={data} />;
	else if (page.category === 'colour') content = <ColorPage data={data} />;
	else if (page.category === 'typography') content = <TypographyPage data={data} />;
	else if (page.category === 'spacing') content = <SpacingPage data={data} />;
	else if (page.category === 'shape') content = <ShapePage data={data} />;
	else if (page.category === 'elevation') content = <ElevationPage data={data} />;
	else if (page.category === 'motion') content = <MotionPage data={data} />;
	else if (page.layer === 'component') content = <ComponentTokensPage data={data} />;
	else content = <LayerPage page={page} data={data} />;
	return <div className="not-content foundation-explorer"><TokenLegend />{content}</div>;
}
