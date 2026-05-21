export type OrderCategoryDef = {
  id: string;
  title: string;
  subtitle?: string;
  /** Try in order: `.jpg` first, then `.jpeg` / `.png`. Vite serves `public/` at `/`; static `serve` may use `/public/...` */
  backgroundUrls: readonly string[];
  ctaLabel: "DÉCOUVRIR" | "COMMANDER";
};

const BG_EXT = ["jpg", "jpeg", "png"] as const;

function backgroundUrlsForSlot(n: 1 | 2 | 3 | 4): readonly string[] {
  return BG_EXT.flatMap((ext) => [
    `/background${n}.${ext}`,
    `/public/background${n}.${ext}`,
    `public/background${n}.${ext}`,
  ]);
}

/**
 * Assets live under `public/` in the repo. Vite exposes them at `/…`; plain static
 * servers may need `/public/…` or `public/…` relative to the page.
 */
export const ORDER_CATEGORIES: readonly OrderCategoryDef[] = [
  {
    id: "tondeuse",
    title: "Tondeuse",
    backgroundUrls: backgroundUrlsForSlot(1),
    ctaLabel: "DÉCOUVRIR",
  },
  {
    id: "ciseaux",
    title: "Ciseaux et peignes",
    backgroundUrls: backgroundUrlsForSlot(2),
    ctaLabel: "DÉCOUVRIR",
  },
  {
    id: "accessoires",
    title: "Accessoires",
    backgroundUrls: backgroundUrlsForSlot(3),
    ctaLabel: "DÉCOUVRIR",
  },
  {
    id: "marchandise",
    title: "Marchandise",
    backgroundUrls: backgroundUrlsForSlot(4),
    ctaLabel: "COMMANDER",
  },
];
