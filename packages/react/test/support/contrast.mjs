// WCAG 2.x contrast for the recipe palette's tests: what a piece of text or a part must reach (1.4.3, 1.4.11) and the ratio of two colors.
// The Chromium sweep reads computed colors, sizes and weights in the page and measures with these; the static palette test measures the
// palette against the theme's own page colors with the same functions.

/** @typedef {{ r: number, g: number, b: number, a?: number }} Rgba Channels 0 to 255; alpha 0 to 1 (1 when absent). */

/**
 * The contrast a piece of text or a part has to reach. Normal text needs 4.5:1; large text (24px or more, or 18.66px or more when bold)
 * and parts that hold no text (an icon, a mark) need 3:1.
 * @param {{ text: boolean, fontSize: number, fontWeight: number }} measured The computed font size in px and weight of the element.
 * @returns {3 | 4.5}
 */
export function requiredContrast({ text, fontSize, fontWeight }) {
  const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
  return text && !large ? 4.5 : 3;
}

/** The color `top` shows over an opaque `bottom`. */
export function over(top, bottom) {
  const alpha = top.a ?? 1;
  return { r: top.r * alpha + bottom.r * (1 - alpha), g: top.g * alpha + bottom.g * (1 - alpha), b: top.b * alpha + bottom.b * (1 - alpha), a: 1 };
}

/** Relative luminance of an opaque sRGB color. */
export function luminance({ r, g, b }) {
  const linear = (channel) => (channel / 255 <= 0.03928 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The contrast ratio of `foreground` drawn over the opaque `background`; a translucent foreground is composited first. */
export function contrastRatio(foreground, background) {
  const [high, low] = [luminance(over(foreground, background)), luminance(background)].sort((left, right) => right - left);
  return (high + 0.05) / (low + 0.05);
}

/** `#rrggbb` or `#rrggbbaa` as channels. */
export function parseHex(hex) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/iu.exec(hex);
  if (!match) throw new Error(`${hex} is not a hex color`);
  const [r, g, b] = match.slice(1, 4).map((channel) => Number.parseInt(channel, 16));
  return { r, g, b, a: match[4] === undefined ? 1 : Number.parseInt(match[4], 16) / 255 };
}
