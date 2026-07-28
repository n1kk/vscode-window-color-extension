/** Minimal color helpers: everything works on `#rrggbb` strings. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parses `#rgb` / `#rrggbb` (with or without `#`). Returns undefined if malformed. */
export function parseHex(value: string): Rgb | undefined {
  const match = HEX.exec(value.trim());
  if (!match) {
    return undefined;
  }
  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

/** Normalizes any accepted input to lowercase `#rrggbb`, or undefined if malformed. */
export function normalizeHex(value: string): string | undefined {
  const rgb = parseHex(value);
  return rgb && toHex(rgb);
}

export function toHex({ r, g, b }: Rgb): string {
  const channel = (v: number) => clampByte(v).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Appends an alpha channel, producing the `#rrggbbaa` form VS Code accepts. */
export function withAlpha(hex: string, alpha: number): string {
  const a = clampByte(Math.round(alpha * 255))
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/** Linear blend: `amount` of 0 returns `from`, 1 returns `to`. */
export function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) {
    return from;
  }
  const t = Math.min(1, Math.max(0, amount));
  return toHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  );
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#15202b";

/** Picks whichever of the two text tones reads better on `background`. */
export function readableForeground(background: string): string {
  return contrast(background, LIGHT_TEXT) >= contrast(background, DARK_TEXT)
    ? LIGHT_TEXT
    : DARK_TEXT;
}

/** `h` in degrees (0–360), `s` and `l` as 0–1. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[Math.floor(hue / 60) % 6];
  return toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

/**
 * Which half of the lightness range a grid covers. Splitting them lets the full
 * grid spend its rows on one band instead of straddling both.
 */
export type SwatchVariant = "dark" | "light";

export const SWATCH_VARIANTS: readonly SwatchVariant[] = ["dark", "light"];

interface Band {
  saturation: number;
  /** Lightness of the top row. */
  startLightness: number;
  /** Lightness of the bottom row. */
  endLightness: number;
}

/** Both ends stay clear of 0 and 1, so no swatch comes out black or white. */
const SWATCH_BANDS: Record<SwatchVariant, Band> = {
  dark: { saturation: 0.45, startLightness: 0.44, endLightness: 0.08 },
  light: { saturation: 0.45, startLightness: 0.92, endLightness: 0.52 },
};

/**
 * Builds a swatch grid: one column per hue around the wheel, and rows ramping
 * evenly from the band's start lightness down to its end lightness.
 *
 * @param hueSteps Number of hues (columns) to walk the color wheel in.
 * @param rows     Total number of rows, counting the start and end colors.
 * @returns Rows ordered start to end, each row ordered by hue.
 */
export function buildSwatchGrid(
  hueSteps: number,
  rows: number,
  variant: SwatchVariant,
): string[][] {
  const { saturation, startLightness, endLightness } = SWATCH_BANDS[variant];
  // Max guards the single-row case; otherwise the last row lands exactly on end.
  const step = (endLightness - startLightness) / Math.max(1, rows - 1);

  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: hueSteps }, (_, column) =>
      hslToHex((360 / hueSteps) * column, saturation, startLightness + step * row),
    ),
  );
}

function clampByte(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}
