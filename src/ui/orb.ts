/**
 * Three colors per orb that complement each other, never grey. Dark ones carry a white initial,
 * light ones a dark initial (`initialColor`); either keeps `MIN_INITIAL_CONTRAST` on every color
 * and every blend of two, which `orb.test.ts` checks, so the colors of one palette must be alike
 * in lightness. Appending is safe; inserting or reordering moves every login to another palette.
 */
export const PALETTES: readonly (readonly [string, string, string])[] = [
  ["#7d5dc4", "#b04ebf", "#4c46b0"],
  ["#a57040", "#975379", "#6b3f83"],
  ["#2d8996", "#4978c4", "#2c5787"],
  ["#4b8e68", "#347a7a", "#39634e"],
  ["#bd5e7a", "#945baa", "#98426a"],
  ["#a17a43", "#8f5e5d", "#3e6b71"],
  ["#4486b2", "#6163be", "#3e4b8e"],
  ["#588a47", "#398c82", "#3c6d4e"],
  ["#9f5d83", "#6856a6", "#4c6fa8"],
  ["#8d7e37", "#617e41", "#376b53"],
  ["#39879d", "#4376b2", "#5262ab"],
  ["#995691", "#b46485", "#734a9e"],
  ["#927340", "#6e8655", "#376b6b"],
  ["#485cb0", "#3886a3", "#58489b"],
  ["#378b7c", "#347c90", "#2a6e6e"],
  ["#7f63b1", "#8e70b8", "#62539b"],
  ["#ac6e58", "#a55e78", "#785895"],
  ["#608235", "#488c52", "#396f3f"],
  ["#977926", "#a36c28", "#646e30"],
  ["#9a6240", "#7a4f45", "#5f4a6e"],
  ["#1a869c", "#2877aa", "#2a8b83"],
  ["#638925", "#468938", "#2a7b5e"],
  ["#2f4a9a", "#3a3f86", "#2a6e86"],
  ["#4fa6dc", "#3fb5a8", "#6a8fe0"],
  ["#e0832e", "#d96a8a", "#c4962c"],
  ["#e07aa0", "#c780d0", "#d88a9a"],
  ["#4db89a", "#5aae5e", "#3aa7b8"],
  ["#c862d8", "#8a6ae8", "#e070b0"],
  ["#2fb3c4", "#4a9be0", "#3fc0a0"],
  ["#e68a2e", "#d9a02c", "#d07a2e"],
  ["#8f86e0", "#6fa0e6", "#b080d8"],
  ["#f2cc4a", "#f0a04b", "#c9d85a"],
  ["#f4a98a", "#f08fb0", "#c9a0e8"],
  ["#8ec9f0", "#8fe0c8", "#b9a8f0"],
  ["#f0dc6a", "#9ee0a8", "#8ccfe8"],
  ["#f5b87a", "#f0a0a8", "#e8d090"],
  ["#7ad8d0", "#c4e070", "#f0e080"],
  ["#b8a0f0", "#f0a8d8", "#98c0f0"],
];

/** The least contrast the initial keeps on any orb color; below the usual 3:1 by decision (docs/decisions.md). */
export const MIN_INITIAL_CONTRAST = 2.4;

const INITIAL_LIGHT = "#ffffff";
const INITIAL_DARK = "#1c1c24";

/**
 * Colors too light for the white initial to sit on: a small glow on the orb's rim, never under
 * the letter. Which orbs get one, and which, comes from the login.
 */
export const ACCENTS = ["#f2cc4a", "#b9bec6", "#ffffff", "#f4a98a"] as const;

/** How far an accent reaches, as a percentage of the gradient ray (to the farthest corner). */
export const ACCENT_STOP = 20;

/** Radius around the orb's center, as a fraction of its size, that the initial may occupy. */
export const LETTER_ZONE = 0.25;

/** Largest RGB distance between two colors of a palette below which its colors count as alike. */
export const SIMILAR = 72;

export interface OrbStyle {
  "--c1": string;
  "--c2": string;
  "--c3": string;
  "--x1": string;
  "--y1": string;
  "--x2": string;
  "--y2": string;
  "--ca": string;
  "--xa": string;
  "--ya": string;
  "--sa": string;
  "--ink": string;
}

/**
 * Where an accent at the given angle sits: on the orb's rim, as fractions of its size.
 *
 * @example
 *   rimPoint(0); // { x: 1, y: 0.5 }
 */
export function rimPoint(degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return { x: 0.5 + 0.5 * Math.cos(radians), y: 0.5 + 0.5 * Math.sin(radians) };
}

/** How far an accent at the given angle reaches into the orb, as a fraction of its size. */
export function accentReach(degrees: number): number {
  const { x, y } = rimPoint(degrees);
  const farthest = Math.max(...[0, 1].flatMap((cx) => [0, 1].map((cy) => Math.hypot(x - cx, y - cy))));
  return (ACCENT_STOP / 100) * farthest;
}

/**
 * The colors of a palette as cloud, cloud and ground. Alike colors would blur into one, so the
 * lightest becomes the ground, which fills the most, and the darkest the lower cloud; palettes
 * with distinct colors keep their order.
 *
 * @example
 *   arrange(["#4b8e68", "#347a7a", "#39634e"]); // ["#347a7a", "#39634e", "#4b8e68"]
 */
export function arrange(palette: readonly [string, string, string]): [string, string, string] {
  const rgb = palette.map(toRgb);
  const spread = Math.max(...rgb.flatMap((a, i) => rgb.slice(i + 1).map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))));
  if (spread >= SIMILAR) return [...palette];
  const [light, mid, dark] = [...palette].sort((a, b) => luminance(toRgb(b)) - luminance(toRgb(a)));
  return [mid, dark, light];
}

/** Angles on the rim an accent can sit at, so two orbs with the same colors still differ. */
export const ACCENT_ANGLES = 8;

/** Looks per palette: none with no accent, or one of each accent at each angle. */
const SLOTS = 1 + ACCENTS.length * ACCENT_ANGLES;

/**
 * How many orbs differ in what people see: palette, accent and where the accent sits. A look is
 * one number below this, so a person's look is easy to keep and compare.
 */
export const LOOKS = PALETTES.length * SLOTS;

/**
 * The palette, accent and accent angle (in degrees) a look stands for.
 *
 * @example
 *   lookParts(0); // { palette: 0, accent: null, degrees: 0 }
 */
export function lookParts(look: number): { palette: number; accent: number | null; degrees: number } {
  const palette = Math.floor(look / SLOTS) % PALETTES.length;
  const slot = look % SLOTS;
  if (slot === 0) return { palette, accent: null, degrees: 0 };
  const index = slot - 1;
  return { palette, accent: index % ACCENTS.length, degrees: (Math.floor(index / ACCENTS.length) * 360) / ACCENT_ANGLES };
}

/**
 * The look a login gets from its name alone, before anyone else's orbs are considered. About half
 * of the logins get an accent. Seed 0 is the first draw; each further seed is another one, which
 * carries over the orbs viewers shuffled before looks were stored.
 *
 * @example
 *   preferredLook("sara"); // a number below LOOKS
 */
export function preferredLook(login: string, seed = 0): number {
  const base = loginHash(login);
  const hash = seed === 0 ? base : mix(base ^ Math.imul(seed, 0x9e3779b1));
  const drawn = mix(hash);
  const accent = drawn % (ACCENTS.length * 2);
  const angle = Math.round(((drawn >>> 8) % 360) / (360 / ACCENT_ANGLES)) % ACCENT_ANGLES;
  const slot = accent < ACCENTS.length ? 1 + angle * ACCENTS.length + accent : 0;
  return (hash % PALETTES.length) * SLOTS + slot;
}

/**
 * The CSS variables of a login's orb: the look's palette and accent, and where the two color
 * clouds sit, which comes from the login and the look. The same login and look always give the
 * same orb.
 *
 * @param look  A look from `orbLooks.ts`; without one, the login's `preferredLook`.
 *
 * @example
 *   <span className="avatar-placeholder" style={orbStyle("sara")} />
 *   <span className="avatar-placeholder" style={orbStyle("sara", 412)} />
 */
export function orbStyle(login: string, look = preferredLook(login)): OrbStyle {
  const { palette: index, accent, degrees } = lookParts(look);
  const palette = PALETTES[index];
  const [c1, c2, c3] = arrange(palette);
  const hash = mix(loginHash(login) ^ Math.imul(look + 1, 0x9e3779b1));
  const at = (shift: number) => `${20 + ((hash >>> shift) % 60)}%`;
  const { x, y } = rimPoint(degrees);
  return {
    "--c1": c1,
    "--c2": c2,
    "--c3": c3,
    "--x1": at(3),
    "--y1": at(7),
    "--x2": at(11),
    "--y2": at(15),
    "--ca": accent === null ? "transparent" : ACCENTS[accent],
    "--xa": `${(x * 100).toFixed(1)}%`,
    "--ya": `${(y * 100).toFixed(1)}%`,
    "--sa": `${ACCENT_STOP}%`,
    "--ink": initialColor(palette),
  };
}

function loginHash(login: string): number {
  return [...login].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
}

/** Murmur3's finalizer: spreads a small change in the input over all bits. */
function mix(value: number): number {
  let h = value >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function toRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG contrast ratio of two sRGB colors, 1 to 21. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Every color of a palette and every even blend of two: the grounds the initial can land on. */
export function grounds(palette: readonly [string, string, string]): [number, number, number][] {
  const colors = palette.map(toRgb);
  const blends = colors.flatMap((a, i) => colors.slice(i + 1).map((b) => a.map((v, k) => (v + b[k]) / 2) as [number, number, number]));
  return [...colors, ...blends];
}

/**
 * The color of the initial on an orb of this palette: white while it keeps `MIN_INITIAL_CONTRAST`
 * on every ground, a dark ink on lighter palettes.
 *
 * @example
 *   initialColor(["#7d5dc4", "#b04ebf", "#4c46b0"]); // "#ffffff"
 *   initialColor(["#f2cc4a", "#f0a04b", "#c9d85a"]); // "#1c1c24"
 */
export function initialColor(palette: readonly [string, string, string]): string {
  const white = toRgb(INITIAL_LIGHT);
  return grounds(palette).every((ground) => contrastRatio(white, ground) >= MIN_INITIAL_CONTRAST) ? INITIAL_LIGHT : INITIAL_DARK;
}

/** WCAG relative luminance of an sRGB color. */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
