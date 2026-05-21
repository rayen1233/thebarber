import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";

const TITLE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const titleShell =
  "relative m-0 text-center font-hero text-[clamp(2.65rem,9.5vw,5.75rem)] font-semibold leading-[1.02] sm:text-[clamp(2.85rem,8.2vw,5.5rem)]";

/** Champagne body with a whisper of gold at the outer edges only. */
const letterStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, rgba(212, 185, 120, 0.55) 0%, #f2eadc 5%, #f2eadc 95%, rgba(212, 185, 120, 0.55) 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  filter: "drop-shadow(0 8px 35px rgba(0,0,0,0.55))",
};

export type LuxuryTitleProps = {
  text: string;
  delay?: number;
  className?: string;
};

/**
 * “The Barber” only: per-letter reveal + post-reveal breathing on the line.
 */
export function LuxuryTitle({
  text,
  delay = 0,
  className = "",
}: LuxuryTitleProps) {
  const reduced = useReducedMotion();
  const chars = [...text];
  const letterStagger = 0.035;
  const letterDur = 0.68;
  const lastStagger = Math.max(0, chars.length - 1) * letterStagger;
  const breatheDelay = delay + lastStagger + letterDur + 0.15;

  if (reduced) {
    return (
      <h1
        className={`${titleShell} inline-block ${className}`.trim()}
        style={letterStyle}
      >
        {text}
      </h1>
    );
  }

  return (
    <div className={`relative -mt-1 inline-block max-w-full sm:-mt-2 ${className}`.trim()}>
      <motion.span
        className={`pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 ${titleShell} inline-block blur-[9px]`}
        style={{ ...letterStyle, opacity: 0.12 }}
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 0.85, delay: delay + 0.1, ease: TITLE_EASE }}
      >
        {text}
      </motion.span>

      <motion.h1
        className={`${titleShell} inline-block`}
        initial={{ opacity: 1 }}
        animate={{ opacity: [1, 0.95, 1] }}
        transition={{
          duration: 6.5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: breatheDelay,
        }}
      >
        {chars.map((ch, i) => {
          if (ch === " ") {
            return (
              <span
                key={`sp-${i}`}
                className="inline-block w-[0.3em]"
                aria-hidden
              />
            );
          }
          return (
            <motion.span
              key={`${ch}-${i}`}
              className="inline-block will-change-transform"
              style={letterStyle}
              initial={{ opacity: 0, y: 22, filter: "blur(10px)" }}
              animate={{
                opacity: 1,
                y: 0,
                filter: "blur(0px)",
              }}
              transition={{
                duration: letterDur,
                delay: delay + i * letterStagger,
                ease: TITLE_EASE,
              }}
            >
              {ch}
            </motion.span>
          );
        })}
      </motion.h1>
    </div>
  );
}
