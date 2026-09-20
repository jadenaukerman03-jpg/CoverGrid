// Brand colors for the app. Majestic Care by default, changeable per company.
export const DEFAULT_BRAND = { primary: "#5c96c6", accent: "#5c96c6" } as const;

export type BrandTheme = { primary: string; accent: string };

export function isHexColor(value: string) {
  return /^#([0-9a-f]{6})$/i.test(value.trim());
}

export function normalizeHex(value: string, fallback: string) {
  const v = value.trim();
  if (isHexColor(v)) return v.toLowerCase();
  // tolerate a stray extra character or a 3-digit shorthand
  const digits = v.replace(/[^0-9a-f]/gi, "");
  if (digits.length === 3)
    return `#${digits
      .split("")
      .map((c) => c + c)
      .join("")}`.toLowerCase();
  if (digits.length >= 6) return `#${digits.slice(0, 6)}`.toLowerCase();
  return fallback;
}

type Oklch = { l: number; c: number; h: number };

function srgbToLinear(v: number) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function hexToOklch(hex: string): Oklch {
  const h = normalizeHex(hex, "#000000").slice(1);
  const r = srgbToLinear(parseInt(h.slice(0, 2), 16) / 255);
  const g = srgbToLinear(parseInt(h.slice(2, 4), 16) / 255);
  const b = srgbToLinear(parseInt(h.slice(4, 6), 16) / 255);

  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: H };
}

const fmt = ({ l, c, h }: Oklch) => `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
/** Same hue as the brand color, at an explicit lightness and a share of its color intensity. */
const tone = (base: Oklch, lightness: number, chromaScale = 1): Oklch => ({
  l: Math.min(0.99, Math.max(0.04, lightness)),
  c: Math.max(0, base.c * chromaScale),
  h: base.h,
});
const readableOn = (base: Oklch) => (base.l > 0.6 ? tone(base, 0.2, 0.5) : tone(base, 0.985, 0.02));

/** Every CSS variable derived from the two brand colors. */
export function brandVariables(theme: BrandTheme): Record<string, string> {
  const p = hexToOklch(normalizeHex(theme.primary, DEFAULT_BRAND.primary));
  const a = hexToOklch(normalizeHex(theme.accent, DEFAULT_BRAND.accent));
  return {
    "--primary": fmt(p),
    "--primary-foreground": fmt(readableOn(p)),
    "--ring": fmt(p),
    "--accent": fmt(a),
    "--accent-foreground": fmt(readableOn(a)),
    "--secondary": fmt(tone(p, 0.93, 0.28)),
    "--secondary-foreground": fmt(tone(p, 0.32, 0.7)),
    "--muted": fmt(tone(a, 0.95, 0.25)),
    "--muted-foreground": fmt(tone(p, 0.52, 0.35)),
    "--surface": fmt(tone(p, 0.965, 0.14)),
    "--border": fmt(tone(p, 0.89, 0.2)),
    "--input": fmt(tone(p, 0.89, 0.2)),
    "--chart-1": fmt(p),
    "--chart-3": fmt(a),
    "--sidebar": fmt(tone(p, 0.3, 0.55)),
    "--sidebar-foreground": fmt(tone(p, 0.96, 0.06)),
    "--sidebar-primary": fmt(a),
    "--sidebar-primary-foreground": fmt(readableOn(a)),
    "--sidebar-accent": fmt(tone(p, 0.38, 0.6)),
    "--sidebar-accent-foreground": fmt(tone(p, 0.97, 0.05)),
    "--sidebar-border": fmt(tone(p, 0.42, 0.5)),
    "--sidebar-ring": fmt(a),
  };
}

/** Paint the brand colors onto the live page. */
export function applyBrandTheme(theme: BrandTheme | null | undefined) {
  if (typeof document === "undefined") return;
  const vars = brandVariables(theme ?? DEFAULT_BRAND);
  for (const [name, value] of Object.entries(vars))
    document.documentElement.style.setProperty(name, value);
}
