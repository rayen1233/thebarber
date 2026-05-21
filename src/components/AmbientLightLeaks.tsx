import { motion, useReducedMotion } from "framer-motion";

const EASE_SLOW = [0.22, 0.08, 0.18, 1] as const;

export type AmbientLightLeaksProps = {
  className?: string;
};

/**
 * Very soft side leaks and slow golden drift — keeps the plate dark and premium.
 */
export function AmbientLightLeaks({ className = "" }: AmbientLightLeaksProps) {
  const reduced = useReducedMotion();

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[3] overflow-hidden ${className}`.trim()}
      aria-hidden
    >
      <motion.div
        className="absolute -left-[6%] top-0 h-full w-[min(46%,560px)] mix-blend-screen"
        style={{
          opacity: reduced ? 0.45 : 0.58,
          background:
            "radial-gradient(ellipse 72% 58% at 18% 40%, rgba(235, 215, 170, 0.22) 0%, rgba(180, 150, 90, 0.065) 42%, transparent 68%)",
        }}
        animate={
          reduced
            ? {}
            : {
                x: [0, 10, -4, 6, 0],
                opacity: [0.5, 0.62, 0.55, 0.6, 0.5],
              }
        }
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute -right-[5%] top-0 h-full w-[min(44%,520px)] mix-blend-screen"
        style={{
          opacity: reduced ? 0.4 : 0.52,
          background:
            "radial-gradient(ellipse 70% 56% at 82% 36%, rgba(225, 200, 150, 0.18) 0%, rgba(160, 130, 75, 0.055) 44%, transparent 68%)",
        }}
        animate={
          reduced
            ? {}
            : {
                x: [0, -12, 5, -7, 0],
                opacity: [0.42, 0.55, 0.48, 0.52, 0.42],
              }
        }
        transition={{
          duration: 32,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />
      <motion.div
        className="absolute inset-0 mix-blend-overlay opacity-[0.032]"
        style={{
          background:
            "linear-gradient(102deg, transparent 36%, rgba(255, 246, 228, 0.35) 50%, transparent 64%)",
          backgroundSize: "200% 200%",
        }}
        animate={
          reduced
            ? {}
            : { backgroundPosition: ["8% 30%", "92% 62%", "14% 70%", "8% 30%"] }
        }
        transition={{
          duration: 40,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      <motion.div
        className="absolute inset-0 mix-blend-screen opacity-[0.022]"
        style={{
          background:
            "radial-gradient(ellipse 36% 30% at 72% 22%, rgba(255, 250, 240, 0.5) 0%, transparent 70%)",
        }}
        animate={
          reduced
            ? {}
            : { opacity: [0.018, 0.03, 0.022, 0.028, 0.02] }
        }
        transition={{
          duration: 24,
          repeat: Infinity,
          ease: EASE_SLOW,
        }}
      />
    </div>
  );
}
