import { motion, useReducedMotion } from "framer-motion";

const EASE_LUXE = [0.22, 0.08, 0.18, 1] as const;

const LINE_OPACITY = 0.13;
const LINE_OPACITY_SOFT = 0.095;
const CORNER_LINE = 0.165;

type Seg = {
  key: string;
  className: string;
  axis: "x" | "y";
  delay: number;
  blur?: boolean;
  bright?: boolean;
};

/** Corners + short broken edges only (no continuous mid lines). */
const SEGMENTS: Seg[] = [
  {
    key: "tl-h",
    className:
      "absolute left-0 top-0 h-px w-[min(18%,11rem)] origin-left bg-gradient-to-r from-[rgba(200,175,115,0.42)] via-[rgba(182,154,82,0.28)] to-transparent",
    axis: "x",
    delay: 0,
    bright: true,
  },
  {
    key: "tl-v",
    className:
      "absolute left-0 top-0 h-[18%] w-px origin-top bg-gradient-to-b from-[rgba(200,175,115,0.4)] via-[rgba(182,154,82,0.26)] to-transparent",
    axis: "y",
    delay: 0.08,
  },
  {
    key: "tr-h",
    className:
      "absolute right-0 top-0 h-px w-[min(18%,11rem)] origin-right bg-gradient-to-l from-[rgba(200,175,115,0.42)] via-[rgba(182,154,82,0.26)] to-transparent",
    axis: "x",
    delay: 0.2,
    bright: true,
  },
  {
    key: "tr-v",
    className:
      "absolute right-0 top-0 h-[18%] w-px origin-top bg-gradient-to-b from-[rgba(200,175,115,0.38)] via-[rgba(182,154,82,0.22)] to-transparent",
    axis: "y",
    delay: 0.28,
    blur: true,
  },
  {
    key: "bl-h",
    className:
      "absolute bottom-0 left-0 h-px w-[min(16%,9.5rem)] origin-left bg-gradient-to-r from-[rgba(182,154,82,0.3)] via-[rgba(182,154,82,0.18)] to-transparent",
    axis: "x",
    delay: 0.4,
  },
  {
    key: "bl-v",
    className:
      "absolute bottom-0 left-0 h-[16%] w-px origin-bottom bg-gradient-to-t from-[rgba(182,154,82,0.3)] via-[rgba(182,154,82,0.18)] to-transparent",
    axis: "y",
    delay: 0.48,
    blur: true,
  },
  {
    key: "br-h",
    className:
      "absolute bottom-0 right-0 h-px w-[min(16%,9.5rem)] origin-right bg-gradient-to-l from-[rgba(182,154,82,0.3)] via-[rgba(182,154,82,0.18)] to-transparent",
    axis: "x",
    delay: 0.56,
  },
  {
    key: "br-v",
    className:
      "absolute bottom-0 right-0 h-[16%] w-px origin-bottom bg-gradient-to-t from-[rgba(200,175,115,0.36)] via-[rgba(182,154,82,0.22)] to-transparent",
    axis: "y",
    delay: 0.64,
    bright: true,
  },
];

const CORNER_SPARKLE_POS = [
  "left-0 top-0 translate-x-[2px] translate-y-[2px]",
  "right-0 top-0 -translate-x-[2px] translate-y-[2px]",
  "bottom-0 left-0 translate-x-[2px] -translate-y-[2px]",
  "bottom-0 right-0 -translate-x-[2px] -translate-y-[2px]",
] as const;

export type LuxuryHeroFrameProps = {
  baseDelay?: number;
  segmentDuration?: number;
  className?: string;
};

/**
 * Broken luxury border: corners + short segments, corner glow, glint pass.
 */
export function LuxuryHeroFrame({
  baseDelay = 0,
  segmentDuration = 1.12,
  className = "",
}: LuxuryHeroFrameProps) {
  const reduced = useReducedMotion();
  const d = baseDelay;
  const dur = reduced ? 0.01 : segmentDuration;

  return (
    <div
      className={`pointer-events-none absolute inset-5 z-[8] sm:inset-12 ${className}`.trim()}
      aria-hidden
    >
      {[
        "left-0 top-0 h-20 w-20 translate-x-[-15%] translate-y-[-15%] sm:h-24 sm:w-24",
        "right-0 top-0 h-20 w-20 translate-x-[15%] translate-y-[-15%] sm:h-24 sm:w-24",
        "bottom-0 left-0 h-20 w-20 translate-x-[-15%] translate-y-[15%] sm:h-24 sm:w-24",
        "bottom-0 right-0 h-20 w-20 translate-x-[15%] translate-y-[15%] sm:h-24 sm:w-24",
      ].map((cornerClass, i) => (
        <motion.div
          key={i}
          className={`absolute ${cornerClass} rounded-full bg-[radial-gradient(circle,rgba(210,185,120,0.28)_0%,transparent_68%)] blur-3xl`}
          initial={{ opacity: 0 }}
          animate={
            reduced
              ? { opacity: 0.08 }
              : {
                  opacity: [0.075, 0.1, 0.082, 0.095, 0.075],
                }
          }
          transition={{
            duration: reduced ? 0.01 : 11.2 + i * 0.85,
            repeat: reduced ? 0 : Infinity,
            ease: "easeInOut",
            delay: reduced ? 0 : d + [0, 0.2, 0.4, 0.56][i],
          }}
        />
      ))}

      {CORNER_SPARKLE_POS.map((pos, i) => (
        <motion.div
          key={`sp-${i}`}
          className={`absolute ${pos} h-[2px] w-[2px] rounded-full bg-[rgba(245,228,190,0.22)] shadow-[0_0_3px_rgba(220,190,120,0.14)]`}
          animate={
            reduced
              ? { opacity: 0.09 }
              : { opacity: [0.06, 0.14, 0.075, 0.12, 0.06] }
          }
          transition={{
            duration: 6.2 + i * 0.55,
            repeat: reduced ? 0 : Infinity,
            ease: "easeInOut",
            delay: d + 0.9 + i * 0.45,
          }}
        />
      ))}

      {SEGMENTS.map((seg) => {
        const from = reduced ? 1 : 0;
        const op = Math.min(
          0.165,
          seg.bright ? CORNER_LINE : seg.blur ? LINE_OPACITY_SOFT : LINE_OPACITY,
        );
        const initial =
          seg.axis === "x"
            ? { scaleX: from, opacity: reduced ? op : 0 }
            : { scaleY: from, opacity: reduced ? op : 0 };
        const animate =
          seg.axis === "x"
            ? { scaleX: 1, opacity: op }
            : { scaleY: 1, opacity: op };

        return (
          <motion.div
            key={seg.key}
            className={`${seg.className} ${seg.blur ? "blur-[0.45px]" : ""}`}
            initial={initial}
            animate={animate}
            transition={{
              duration: dur,
              delay: reduced ? 0 : d + seg.delay,
              ease: EASE_LUXE,
            }}
          />
        );
      })}

      {!reduced && (
        <motion.div
          className="pointer-events-none absolute top-0 z-[3] h-[2px] w-[48px] rounded-full bg-gradient-to-r from-transparent via-[rgba(245, 228, 190, 0.55)] to-transparent"
          style={{
            filter: "blur(7px)",
            marginLeft: "-24px",
          }}
          initial={{ left: "-6%", opacity: 0 }}
          animate={{
            left: ["-6%", "28%", "61%", "104%"],
            opacity: [0, 0.16, 0.14, 0],
          }}
          transition={{
            duration: 4.85,
            ease: EASE_LUXE,
            repeat: Infinity,
            repeatDelay: 13.2,
            delay: d + 0.85,
            times: [0, 0.36, 0.7, 1],
          }}
        />
      )}
    </div>
  );
}
