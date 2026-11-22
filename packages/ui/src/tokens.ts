/** Color tokens mirrored from tokens.css, used by the contrast checks and the /dev/tokens page. */
export const colors = {
  paper: '#F3EFE6',
  sheet: '#FBF9F4',
  surface: '#FFFFFF',
  ink: '#101114',
  ink2: '#3B3D44',
  muted: '#62646C',
  line: '#E2DDD0',
  divider: '#F0ECE0',
  cobalt: '#1B3BFF',
  covered: '#1E9A68',
  success: '#0B7A52',
  successPillText: '#07603F',
  successPillBg: '#E1F2E8',
  headsUpBg: '#FFF0D6',
  headsUpBorder: '#EFCF93',
  headsUpText: '#5C3200',
  headsUpStrong: '#4A2700',
  headsUpBar: '#C77700',
  danger: '#B42318',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Stable per-merchant tile colors. A white monogram must reach >= 3:1 on each (checked in tests).
 * The first four are from the spec; the rest were added to keep that property.
 */
export const merchantPalette = [
  '#101114',
  '#E8573B',
  '#5B3FD9',
  '#0B7A52',
  '#B4377A',
  '#0F6E8C',
  '#8A5A00',
  '#7A3E9D',
] as const;

export type ContrastPair = {
  readonly name: string;
  readonly fg: string;
  readonly bg: string;
  /** Minimum ratio: 4.5 for text, 3 for large text / graphical objects. */
  readonly min: 3 | 4.5;
};

export const contrastPairs: readonly ContrastPair[] = [
  { name: 'ink on paper', fg: colors.ink, bg: colors.paper, min: 4.5 },
  { name: 'ink-2 on paper', fg: colors.ink2, bg: colors.paper, min: 4.5 },
  { name: 'muted on paper', fg: colors.muted, bg: colors.paper, min: 4.5 },
  { name: 'muted on sheet', fg: colors.muted, bg: colors.sheet, min: 4.5 },
  { name: 'muted on surface', fg: colors.muted, bg: colors.surface, min: 4.5 },
  { name: 'white on cobalt (primary button)', fg: colors.surface, bg: colors.cobalt, min: 4.5 },
  { name: 'cobalt on paper (links)', fg: colors.cobalt, bg: colors.paper, min: 4.5 },
  { name: 'white on ink (dark pill)', fg: colors.surface, bg: colors.ink, min: 4.5 },
  { name: 'danger on paper', fg: colors.danger, bg: colors.paper, min: 4.5 },
  { name: 'danger on surface', fg: colors.danger, bg: colors.surface, min: 4.5 },
  {
    name: 'success pill text on pill bg',
    fg: colors.successPillText,
    bg: colors.successPillBg,
    min: 4.5,
  },
  { name: 'success on paper (text)', fg: colors.success, bg: colors.paper, min: 4.5 },
  { name: 'heads-up text on heads-up bg', fg: colors.headsUpText, bg: colors.headsUpBg, min: 4.5 },
  {
    name: 'heads-up strong on heads-up bg',
    fg: colors.headsUpStrong,
    bg: colors.headsUpBg,
    min: 4.5,
  },
  { name: 'covered track on paper (graphic)', fg: colors.covered, bg: colors.paper, min: 3 },
  { name: 'heads-up bar on paper (graphic)', fg: colors.headsUpBar, bg: colors.paper, min: 3 },
];
