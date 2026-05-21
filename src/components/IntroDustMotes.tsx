import { motion } from "framer-motion";
import { useMemo } from "react";

/** Deterministic 0..1 from index (stable across renders). */
function rnd(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233 + 42.4567) * 43758.5453;
  return x - Math.floor(x);
}

/** Hero only: keep motes off centered logo and bottom CTA (no title band). */
function inHeroUiExclusion(left: number, top: number) {
  if (top < 42 && left > 14 && left < 86) return true;
  if (top > 74 && left > 18 && left < 82) return true;
  return false;
}

function particlePos(index: number, attempt: number) {
  const salt = index + attempt * 17;
  const left = 3 + rnd(salt, 1) * 94;
  const top = 2 + rnd(salt, 2) * 96;
  return { left, top };
}

const MOTE_SHADOW_SOFT =
  "0 0 2px rgba(255,240,215,0.08), 0 0 6px rgba(200,170,100,0.05)";

export type IntroDustMotesProps = {
  /** When true, static motes (no motion) to match reduced-motion intro.html. */
  reduced: boolean;
  /**
   * `intro` — fixed grid like the original intro loader.
   * `hero` — sparse, low-opacity motes for depth (parallax applied by parent).
   */
  placement?: "intro" | "hero";
  className?: string;
};

type MoteSpec = {
  id: number;
  left: string;
  top: string;
  delay: number;
  dur: number;
  size: number;
  blur: number;
  drift: number;
  opLo: number;
  opHi: number;
};

/**
 * Warm floating dust motes from the cinematic intro — reused on the order hero.
 */
export function IntroDustMotes({
  reduced,
  placement = "intro",
  className = "",
}: IntroDustMotesProps) {
  const motes = useMemo((): MoteSpec[] => {
    const sizeFor = (i: number) => 2 + (i % 2);
    if (placement === "intro") {
      return Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: `${(i * 17 + 7) % 92}%`,
        top: `${(i * 23 + 11) % 78}%`,
        delay: i * 0.22,
        dur: 5 + (i % 4) * 0.85,
        size: sizeFor(i),
        blur: 0.35,
        drift: 1,
        opLo: 0.22,
        opHi: 0.42,
      }));
    }

    const out: MoteSpec[] = [];
    const heroCount = 40;
    for (let i = 0; i < heroCount; i++) {
      let left = 3 + rnd(i, 1) * 94;
      let top = 2 + rnd(i, 2) * 96;
      for (let a = 0; a < 14; a++) {
        const p = particlePos(i, a);
        left = p.left;
        top = p.top;
        if (!inHeroUiExclusion(left, top)) break;
      }
      const rSlow = rnd(i, 7);
      const dur = 18 + rnd(i, 8) * 30;
      const drift = rSlow > 0.72 ? 0.12 + rnd(i, 9) * 0.18 : 0.45 + rnd(i, 10) * 0.55;
      const blur = 0.2 + rnd(i, 11) * 1.05;
      const opLo = 0.025 + rnd(i, 12) * 0.032;
      const opHi = Math.min(0.095, opLo + 0.022 + rnd(i, 13) * 0.038);
      out.push({
        id: i,
        left: `${left}%`,
        top: `${top}%`,
        delay: i * 0.11,
        dur,
        size: 1.5 + rnd(i, 14) * 1.2,
        blur,
        drift,
        opLo,
        opHi,
      });
    }
    return out;
  }, [placement]);

  const heroBlend =
    placement === "hero" ? "mix-blend-screen opacity-[0.72]" : "";

  if (reduced) {
    return (
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 overflow-hidden ${heroBlend} ${className}`.trim()}
      >
        {motes.map((m) => (
          <span
            key={m.id}
            className="absolute rounded-full bg-[#f2eadc]"
            style={{
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              boxShadow: MOTE_SHADOW_SOFT,
              filter: `blur(${m.blur}px)`,
              opacity: placement === "hero" ? 0.07 : 0.28,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${heroBlend} ${className}`.trim()}
    >
      {motes.map((m) => (
        <motion.span
          key={m.id}
          className="absolute rounded-full bg-[#f2eadc]"
          style={{
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            boxShadow: MOTE_SHADOW_SOFT,
            filter: `blur(${m.blur}px)`,
          }}
          initial={{
            opacity: placement === "hero" ? m.opLo : 0.22,
          }}
          animate={
            placement === "hero"
              ? {
                  opacity: [m.opLo, m.opHi, m.opLo * 1.05, m.opHi * 0.88, m.opLo],
                  y: [0, -4 * m.drift, -1.2 * m.drift, -3 * m.drift, 0],
                  x: [0, 2.2 * m.drift, -1.4 * m.drift, 1.6 * m.drift, 0],
                }
              : {
                  opacity: [m.opLo, m.opHi, m.opLo * 0.9, m.opHi * 0.88, m.opLo],
                  y: [0, -14 * m.drift, -6 * m.drift, -14 * m.drift, 0],
                }
          }
          transition={{
            duration: m.dur,
            delay: m.delay * 0.05,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
