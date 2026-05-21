/** Percent rects [left, top, width, height] for 2×2 split; hovered panel ~60% in its quadrant. */

export type PanelRect = { l: number; t: number; w: number; h: number };

const IDLE: readonly PanelRect[] = [
  { l: 0, t: 0, w: 50, h: 50 },
  { l: 50, t: 0, w: 50, h: 50 },
  { l: 0, t: 50, w: 50, h: 50 },
  { l: 50, t: 50, w: 50, h: 50 },
];

const HOVER: Record<number, readonly PanelRect[]> = {
  0: [
    { l: 0, t: 0, w: 60, h: 60 },
    { l: 60, t: 0, w: 40, h: 60 },
    { l: 0, t: 60, w: 60, h: 40 },
    { l: 60, t: 60, w: 40, h: 40 },
  ],
  1: [
    { l: 0, t: 0, w: 40, h: 60 },
    { l: 40, t: 0, w: 60, h: 60 },
    { l: 0, t: 60, w: 40, h: 40 },
    { l: 40, t: 60, w: 60, h: 40 },
  ],
  2: [
    { l: 0, t: 0, w: 60, h: 40 },
    { l: 60, t: 0, w: 40, h: 40 },
    { l: 0, t: 40, w: 60, h: 60 },
    { l: 60, t: 40, w: 40, h: 60 },
  ],
  3: [
    { l: 0, t: 0, w: 40, h: 40 },
    { l: 40, t: 0, w: 60, h: 40 },
    { l: 0, t: 40, w: 40, h: 60 },
    { l: 40, t: 40, w: 60, h: 60 },
  ],
};

export function getSplitRects(hovered: number | null): readonly PanelRect[] {
  if (hovered === null) return IDLE;
  return HOVER[hovered] ?? IDLE;
}

/** Intersection of the main vertical / horizontal dividers, in % of the viewport (matches panel edges). */
export function getSplitCrossPercents(hovered: number | null): {
  vx: number;
  hy: number;
} {
  const rects = getSplitRects(hovered);
  const tl = rects[0]!;
  return {
    vx: tl.l + tl.w,
    hy: tl.t + tl.h,
  };
}
