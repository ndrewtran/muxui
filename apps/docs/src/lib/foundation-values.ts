/** Convert a supported active custom-property value into the token's canonical numeric unit. */
export function normalizeAppliedNumericValue(raw: string, unit: string, rootFontSizePx: number): number | undefined {
	const match = raw.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|ms|s)?$/u);
	if (!match) return undefined;
	const value = Number(match[1]);
	const sourceUnit = match[2] ?? unit;
	if (!Number.isFinite(value)) return undefined;
	if (unit === 'px' && (sourceUnit === 'px' || sourceUnit === '')) return value;
	if (unit === 'px' && (sourceUnit === 'rem' || sourceUnit === 'em')) return value * rootFontSizePx;
	if (unit === 'ms' && (sourceUnit === 'ms' || sourceUnit === '')) return value;
	if (unit === 'ms' && sourceUnit === 's') return value * 1000;
	return undefined;
}
