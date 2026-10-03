/*
 * Mode-consistency audit: Figma binds one variable per part property and lets
 * variable modes vary the value, so every measured mode must resolve a part
 * property to the same token (or the same literal). A component-local
 * override that swaps tokens per mode fails here with its winning rules.
 */

/** A measured value without diagnostics or browser-computed values, for comparison. */
export function comparable(measured) {
  const { rule, via, computed, ...value } = measured;
  return JSON.stringify(value);
}

function describe(measured) {
  const { rule, via, computed, ...value } = measured;
  const target = value.kind === 'token' ? value.token : JSON.stringify(value);
  const hops = (via ?? []).map((hop) => `${hop.property} from ${hop.rule}`).join(' -> ');
  return `${target} by ${rule ?? 'no declaration'}${hops ? ` via ${hops}` : ''}`;
}

/**
 * Every part property whose resolution differs between modes.
 * @param {ReturnType<typeof import('./measure.mjs').measureFamilies> extends Promise<infer T> ? T : never} measurements
 */
export function modeInconsistencies(measurements) {
  const findings = [];
  for (const { family, modes, variants } of measurements) {
    for (const variant of variants) {
      for (const [part, { properties }] of Object.entries(variant.parts)) {
        for (const [property, byMode] of Object.entries(properties)) {
          const values = modes.map((mode) => comparable(byMode[mode]));
          if (values.every((value) => value === values[0])) continue;
          findings.push({
            family,
            variant: variant.key,
            part,
            property,
            modes: Object.fromEntries(modes.map((mode) => [mode, describe(byMode[mode])])),
          });
        }
      }
    }
  }
  return findings;
}

/** Throw a diagnostic naming the family, part, property, and winning rule per mode. */
export function assertModeConsistency(measurements, { limit = 20 } = {}) {
  const findings = modeInconsistencies(measurements);
  if (!findings.length) return;
  const lines = findings.slice(0, limit).map(({ family, variant, part, property, modes }) => [
    `${family} ${part} ${property} (${variant}):`,
    ...Object.entries(modes).map(([mode, text]) => `  ${mode}: ${text}`),
  ].join('\n'));
  const more = findings.length > limit ? `\n...and ${findings.length - limit} more` : '';
  const error = new Error(`MUXUI_FIGMA_MODE_INCONSISTENT: ${findings.length} part properties resolve to different values across modes\n${lines.join('\n')}${more}`);
  error.findings = findings;
  throw error;
}

/** Per-family audit summary for reports. */
export function auditSummary(measurements) {
  const findings = modeInconsistencies(measurements);
  return measurements.map(({ family, variants }) => ({
    family,
    variants: variants.length,
    partProperties: variants.reduce((total, variant) => total + Object.values(variant.parts).reduce((sum, { properties }) => sum + Object.keys(properties).length, 0), 0),
    inconsistent: findings.filter((finding) => finding.family === family).length,
  }));
}
