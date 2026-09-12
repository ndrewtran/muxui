// Mux-owned deterministic Scale palette generation.
// Keep this module dependency-light so authoring and runtime checks share the algorithm.
import { converter, formatHex, clampChroma } from 'culori';

const toOklch = converter('oklch');
const toRgb = converter('rgb');

export const NAMED_SHADES = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
export const NEUTRAL_SHADES = [
  5, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96,
  98, 100,
];
const MONOCHROME_DARK_L_RATIO = 0.08;
const MONOCHROME_DARK_C_RATIO = 0.25;
const MONOCHROME_FALLBACK_COLOR = '#008661';

// Convert OKLCH values to a clamped 6-digit hex string
const oklchToHex = (l, c, h) => {
  const clamped = clampChroma({ mode: 'oklch', l, c, h: h ?? 0 }, 'oklch');
  return formatHex({ mode: 'oklch', ...clamped });
};

const getLinearRgbChannel = (value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
};

const getLinearRgbUnitChannel = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

const getHexRelativeLuminance = (hex) => {
  const h = hex.replace('#', '');
  const r = getLinearRgbChannel(parseInt(h.slice(0, 2), 16));
  const g = getLinearRgbChannel(parseInt(h.slice(2, 4), 16));
  const b = getLinearRgbChannel(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const getOklchRelativeLuminance = (l, c, h) => {
  const rgb = toRgb(clampChroma({ mode: 'oklch', l, c, h: h ?? 0 }, 'oklch'));
  return (
    0.2126 * getLinearRgbUnitChannel(rgb.r) +
    0.7152 * getLinearRgbUnitChannel(rgb.g) +
    0.0722 * getLinearRgbUnitChannel(rgb.b)
  );
};

const findLightnessForLuminance = ({ targetLuminance, c, h, minL, maxL }) => {
  let low = minL;
  let high = maxL;

  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2;
    const luminance = getOklchRelativeLuminance(mid, c, h);

    if (luminance < targetLuminance) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
};

const NEUTRAL_LIGHT_ANCHOR_SHADE = 12;
const getNeutralTintProgress = (shade) =>
  ((60 - shade) / 50) * ((60 - NEUTRAL_LIGHT_ANCHOR_SHADE) / 50);
const NEUTRAL_DARK_END_SHADE = 96;
const getNeutralShadeProgress = (shade) =>
  ((shade - 60) / 40) * ((NEUTRAL_DARK_END_SHADE - 60) / 40);

/**
 * Generate a tonal palette from a base hex (treated as the -60 shade).
 *
 * @param {string} baseHex  - hex string including '#'
 * @param {'named'|'neutral'} mode
 * @param {object} [options]
 * @param {boolean} [options.whiteAnchor=false] - Neutral only: force shade-5 to pure
 *   white (#ffffff).
 * @param {number[]} [options.shades] - Optional shade list override.
 * @param {number} [options.darkLRatio] - Optional shade-100 lightness ratio override.
 * @param {number} [options.darkCRatio] - Optional shade-100 chroma ratio override.
 * @param {boolean} [options.useTypeB=true] - Named only: use the light-base Type B curve.
 * @param {boolean} [options.useNeutralTintSteps=false] - Use neutral tint lightness
 *   spacing without neutral chroma clamping.
 * @returns {Array<{shade: number, hex: string}>}
 */
export const generatePalette = (
  baseHex,
  mode,
  {
    whiteAnchor = false,
    shades: customShades,
    darkLRatio: customDarkLRatio,
    darkCRatio: customDarkCRatio,
    useTypeB = true,
    useNeutralTintSteps = false,
  } = {},
) => {
  const base = toOklch(baseHex);
  if (!base) {
    return [];
  }

  const { l: L60, c: C60, h: H60 } = base;
  const shades = customShades ?? (mode === 'neutral' ? NEUTRAL_SHADES : NAMED_SHADES);
  const isNeutral = mode === 'neutral';
  const usesNeutralTintSteps = isNeutral || useNeutralTintSteps;

  // Light end target (shade 5): near-white with a hint of hue
  const L_MAX = 0.977;

  // Dark end (shade 100): calibrated from spec reference palettes.
  // Shade-100 retains ~55% of the base L and ~62% of the base C —
  // it is dark but visibly tinted, not near-black.
  const DARK_L_RATIO = customDarkLRatio ?? (isNeutral ? 0.45 : 0.55); // fraction of L60 kept at shade-100
  const DARK_C_RATIO = customDarkCRatio ?? (isNeutral ? 0.5 : 0.62); // fraction of C60 kept at shade-100

  // Absolute chroma target at shade-5 — ensures visible hue tinting even for
  // very low-chroma bases (e.g. dark neutralised teals).
  const LIGHT_C_TARGET = isNeutral ? 0.004 : 0.008;

  // Type B: light base (L > 0.70) uses a steep linear interpolation to near-black
  // so shade-100 is always near-black regardless of shade-60's lightness.
  const isTypeB = useTypeB && !isNeutral && L60 > 0.7;
  const neutralLightAnchorChroma = Math.min(Math.max(LIGHT_C_TARGET, 0.002), 0.05);
  const neutralLightAnchorLuminance = usesNeutralTintSteps
    ? getOklchRelativeLuminance(L_MAX, neutralLightAnchorChroma, H60)
    : null;
  const neutralBaseLuminance = usesNeutralTintSteps
    ? getOklchRelativeLuminance(L60, C60, H60)
    : null;

  return shades.map((shade) => {
    // White anchor: neutral-5 = pure white; neutral-10 = the computed shade-5 value
    if (isNeutral && whiteAnchor) {
      if (shade === 5) {
        return { shade, hex: '#ffffff' };
      }
    }

    if (shade === 60) {
      return { shade, hex: baseHex.toLowerCase() };
    }

    let l, c;

    if (shade < 60) {
      if (usesNeutralTintSteps && shade >= 10) {
        // Neutral tint stops are spaced by output luminance so 10→20→...→60
        // reads as even, and 12/14/16/18 split the 10→20 interval evenly.
        const t = getNeutralTintProgress(shade);
        c = C60 + t * (LIGHT_C_TARGET - C60);
        const targetLuminance =
          neutralBaseLuminance + t * (neutralLightAnchorLuminance - neutralBaseLuminance);
        l = findLightnessForLuminance({
          targetLuminance,
          c,
          h: H60,
          minL: L60,
          maxL: L_MAX,
        });
      } else {
        // Tint — interpolate toward near-white
        const t = (60 - shade) / 55;
        l = L60 + t * (L_MAX - L60);
        // Linearly interpolate from C60 down to a fixed near-white target chroma,
        // ensuring visible hue tinting regardless of how low the base chroma is.
        c = C60 + t * (LIGHT_C_TARGET - C60);
      }
    } else {
      // Shade — darken from base toward target dark end
      // t = 0 at shade 60, t = 1 at shade 100
      const t = usesNeutralTintSteps ? getNeutralShadeProgress(shade) : (shade - 60) / 40;
      if (isTypeB) {
        // Steep linear interpolation to dark.
        // L_MIN scales with L60 so very light bases (e.g. L60≈0.95) don't produce
        // a disproportionately dark shade-100 relative to shade-90. The absolute
        // floor 0.26 guards warm hues (orange, yellow) whose sRGB gamut collapses
        // below L≈0.20, clamping chroma to near-zero and producing near-black.
        // Chroma retention raised to 30% (vs typical 10%) so the tint stays
        // perceptible at dark lightness.
        const L_MIN = Math.max(0.26, L60 * 0.33);
        l = L60 + t * (L_MIN - L60);
        c = C60 * (1 - t * 0.7);
      } else {
        l = L60 * (DARK_L_RATIO + (1 - DARK_L_RATIO) * (1 - t));
        c = C60 * (DARK_C_RATIO + (1 - DARK_C_RATIO) * (1 - t));
      }
    }

    // Neutrals: enforce very low chroma so they always read as gray
    if (isNeutral) {
      c = Math.min(c, 0.05);
      c = Math.max(c, 0.002);
    }

    const hex = oklchToHex(l, c, H60);
    return { shade, hex };
  });
};

export const generateMonochromePalette = (baseHex, { whiteAnchor = false } = {}) => {
  const tonePalette = generatePalette(baseHex, 'neutral', { shades: NEUTRAL_SHADES });
  const chromaPalette = generatePalette(baseHex, 'named', {
    shades: NEUTRAL_SHADES,
    darkLRatio: MONOCHROME_DARK_L_RATIO,
    darkCRatio: MONOCHROME_DARK_C_RATIO,
    useTypeB: false,
    useNeutralTintSteps: true,
  });
  const getTone = (shade) => tonePalette.find((p) => p.shade === shade)?.hex;

  return chromaPalette.map(({ shade, hex }) => {
    if (whiteAnchor && shade === 5) {
      return { shade, hex: '#ffffff' };
    }

    const tone = toOklch(getTone(shade));
    const chroma = toOklch(hex);
    if (!tone || !chroma) {
      return { shade, hex };
    }

    const matchedHex = oklchToHex(tone.l, chroma.c, chroma.h);
    if (shade === 60) {
      return { shade, hex: baseHex.toLowerCase() };
    }

    return { shade, hex: matchedHex };
  });
};

/**
 * WCAG relative luminance for a hex colour.
 */
export const getRelativeLuminance = (hex) => {
  return getHexRelativeLuminance(hex);
};

/**
 * WCAG contrast ratio between two hex colours (always ≥ 1).
 */
export const getContrastRatio = (hex1, hex2) => {
  const L1 = getRelativeLuminance(hex1);
  const L2 = getRelativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Generate a random BASE hex colour suitable for the given mode.
 * Validates contrast thresholds against the actual generated palette to
 * eliminate rounding/gamut-clamping discrepancies.
 *
 * Named: moderate-to-high chroma, medium-dark lightness.
 * Monochrome: named chroma expanded to neutral steps, with shade-60 AA vs shade-5
 * and shade-100.
 * Neutral: very low chroma (reads as gray), mid lightness.
 */
export const randomScaleBaseColor = (mode, { whiteAnchor = false, random = Math.random } = {}) => {
  if (!['named', 'neutral', 'monochrome'].includes(mode)) throw new TypeError('MUXUI_SCALE_RANDOM_MODE_INVALID');
  const sample = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new TypeError('MUXUI_SCALE_RANDOM_VALUE_INVALID');
    return value;
  };
  const isNeutral = mode === 'neutral';
  const isMonochrome = mode === 'monochrome';
  const maxAttempts = isMonochrome ? 2000 : 200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const h = sample() * 360;
    const c = isNeutral
      ? 0.01 + sample() * 0.03 // 0.01–0.04
      : 0.1 + sample() * 0.15; // 0.10–0.25

    if (isNeutral) {
      const l = 0.35 + sample() * 0.2; // 0.35–0.55
      const candidateHex = oklchToHex(l, c, h);
      const palette = generatePalette(candidateHex, mode, { whiteAnchor });
      if (!palette.length) {
        continue;
      }
      const get = (shade) => palette.find((p) => p.shade === shade)?.hex;
      const s5 = get(5);
      const s50 = get(50);
      const s100 = get(100);
      if (
        s5 &&
        s50 &&
        s100 &&
        getContrastRatio(candidateHex, s5) >= 4.5 &&
        getContrastRatio(s50, s100) >= 4.5
      ) {
        return candidateHex;
      }
    } else if (isMonochrome) {
      const l = 0.52 + sample() * 0.08; // 0.52–0.60
      const candidateHex = oklchToHex(l, c, h);
      const palette = generateMonochromePalette(candidateHex, { whiteAnchor });
      if (!palette.length) {
        continue;
      }
      const get = (shade) => palette.find((p) => p.shade === shade)?.hex;
      const s5 = get(5);
      const s50 = get(50);
      const s60 = get(60);
      const s100 = get(100);
      if (
        s5 &&
        s50 &&
        s60 &&
        s100 &&
        getContrastRatio(s60, s5) >= 4.5 &&
        getContrastRatio(s50, s100) >= 3.0
      ) {
        return candidateHex;
      }
    } else {
      // Decide type first, then sample L from the matching zone so the
      // validation type always matches generatePalette's isTypeB = L60 > 0.70.
      const isTypeB = sample() < 0.5;
      const l = isTypeB
        ? 0.71 + sample() * 0.17 // Type B zone: L 0.71–0.88
        : 0.38 + sample() * 0.32; // Type A zone: L 0.38–0.70
      const candidateHex = oklchToHex(l, c, h);
      const palette = generatePalette(candidateHex, mode);
      if (!palette.length) {
        continue;
      }
      const get = (shade) => palette.find((p) => p.shade === shade)?.hex;

      if (isTypeB) {
        // Type B: light shade-60 — shade-70 AA-LG vs shade-5, shade-80 AA vs shade-5
        const s5 = get(5);
        const s70 = get(70);
        const s80 = get(80);
        if (
          s5 &&
          s70 &&
          s80 &&
          getContrastRatio(s70, s5) >= 3.0 &&
          getContrastRatio(s80, s5) >= 4.5
        ) {
          return candidateHex;
        }
      } else {
        // Type A: dark shade-60 — shade-60 AA vs shade-5, shade-50 AA-LG vs shade-100
        const s5 = get(5);
        const s50 = get(50);
        const s100 = get(100);
        if (
          s5 &&
          s50 &&
          s100 &&
          getContrastRatio(candidateHex, s5) >= 4.5 &&
          getContrastRatio(s50, s100) >= 3.0
        ) {
          return candidateHex;
        }
      }
    }
  }

  // Fallback to known-good colours (should never be reached in practice)
  if (isNeutral) {
    return '#79716b';
  }

  if (isMonochrome) {
    return MONOCHROME_FALLBACK_COLOR;
  }

  return '#dc2626';
};
