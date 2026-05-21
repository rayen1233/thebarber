import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { AmbientLightLeaks } from "./AmbientLightLeaks";
import { IntroDustMotes } from "./IntroDustMotes";
import { LuxuryHeroFrame } from "./LuxuryHeroFrame";

const EASE_LUXE = [0.22, 0.08, 0.18, 1] as const;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Deeper blacks, warmer plate, restrained saturation — keeps centre readable. */
const GRADING =
  "brightness(0.69) contrast(1.27) saturate(0.52) sepia(0.22) hue-rotate(-4deg)";

const GRAIN_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;

const SPRING_BG = { stiffness: 11, damping: 60, mass: 1.25 };
const SPRING_CONTENT = { stiffness: 13, damping: 62, mass: 1.05 };
const SPRING_DUST = { stiffness: 9, damping: 54, mass: 1.28 };

function VignetteStack({ reduced }: { reduced: boolean }) {
  return (
    <>
      {/* Cinematic exposure lift — gold / brown / ivory, huge blur, opacity capped */}
      <div
        className="pointer-events-none absolute left-1/2 top-[42%] z-[5] h-[min(120vh,920px)] w-[min(140vw,1040px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,236,214,0.16)_0%,rgba(188,148,95,0.08)_32%,rgba(42,32,22,0.025)_55%,transparent_70%)] blur-[100px] mix-blend-soft-light opacity-[0.72]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(circle_at_50%_46%,rgba(255,215,160,0.03)_0%,transparent_55%)] mix-blend-screen opacity-[0.9]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_68%_54%_at_50%_44%,transparent_0%,rgba(0,0,0,0.38)_58%,rgba(0,0,0,0.82)_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[5] bg-[linear-gradient(to_right,rgba(0,0,0,0.64)_0%,transparent_11%,transparent_89%,rgba(0,0,0,0.64)_100%),linear-gradient(to_bottom,rgba(0,0,0,0.5)_0%,transparent_10%,transparent_78%,rgba(0,0,0,0.6)_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_115%_88%_at_50%_100%,rgba(4,3,2,0.52)_0%,transparent_48%)]"
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute inset-0 z-[5] backdrop-blur-[0.5px]"
        animate={reduced ? {} : { opacity: [0.3, 0.35, 0.32, 0.34] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
    </>
  );
}

export type FullScreenOrderHeroProps = {
  imageSrc?: string;
  logoSrc?: string;
  tagline?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** When set, COMMANDER acts as a button (no navigation) and invokes this handler. */
  onCtaClick?: () => void;
  entranceDelayOffset?: number;
  className?: string;
  children?: ReactNode;
};

/**
 * Full-viewport cinematic landing hero.
 */
export function FullScreenOrderHero({
  imageSrc = "/background.webp",
  logoSrc = "/logo-name.png",
  tagline,
  ctaLabel = "COMMANDER",
  ctaHref = "#commander",
  onCtaClick,
  entranceDelayOffset = 0,
  className = "",
  children,
}: FullScreenOrderHeroProps) {
  const reduced = useReducedMotion();
  const [ctaHovered, setCtaHovered] = useState(false);

  const o = entranceDelayOffset;
  const t0 = reduced ? 0 : o;
  const tFrame = reduced ? 0 : o;
  /** Plate first, then logo → tagline → CTA (cinematic stagger). */
  const tLogo = reduced ? 0 : 0.3 + o;
  const tTagline = reduced ? 0 : 0.7 + o;
  const tCta = reduced ? 0 : 1.1 + o;
  const bgDuration = reduced ? 0.2 : 2.45;

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const layerScale = useMotionValue(reduced ? 1 : 1.048);

  const bgTx = useSpring(useTransform(mx, [-1, 1], [10, -10]), SPRING_BG);
  const bgTy = useSpring(useTransform(my, [-1, 1], [9, -9]), SPRING_BG);
  const contentTx = useSpring(useTransform(mx, [-1, 1], [3.5, -3.5]), SPRING_CONTENT);
  const contentTy = useSpring(useTransform(my, [-1, 1], [3, -3]), SPRING_CONTENT);
  const dustTx = useSpring(useTransform(mx, [-1, 1], [16, -16]), SPRING_DUST);
  const dustTy = useSpring(useTransform(my, [-1, 1], [14, -14]), SPRING_DUST);

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      mx.set(nx * 2);
      my.set(ny * 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my, reduced]);

  useEffect(() => {
    if (reduced) {
      layerScale.set(1);
      return;
    }
    let alive = true;
    const run = async () => {
      await animate(layerScale, 1.034, {
        duration: bgDuration,
        delay: t0,
        ease: EASE_LUXE,
      });
      if (!alive) return;
      layerScale.set(1.03);
      animate(layerScale, [1.03, 1.048], {
        duration: 18,
        repeat: Infinity,
        repeatType: "reverse",
        ease: "easeInOut",
      });
    };
    run();
    return () => {
      alive = false;
    };
  }, [reduced, t0, bgDuration, layerScale]);

  return (
    <section
      className={`relative z-[15] h-[100dvh] min-h-[100dvh] w-full shrink-0 overflow-hidden bg-black ${className}`.trim()}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_100%_82%_at_50%_18%,#16120e_0%,#070504_42%,#010000_100%)]"
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.38]"
        style={{
          background:
            "radial-gradient(ellipse 78% 58% at 50% 42%, rgba(32, 26, 20, 0.55) 0%, transparent 66%)",
          filter: "blur(48px)",
        }}
        animate={reduced ? {} : { scale: [1, 1.018, 1], opacity: [0.26, 0.34, 0.29] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />

      <motion.div
        className="absolute inset-0 z-[2] will-change-transform"
        style={{ x: bgTx, y: bgTy }}
      >
        <motion.div
          className="relative h-full w-full origin-center shadow-[inset_0_0_100px_rgba(0,0,0,0.28)]"
          style={{ scale: layerScale }}
        >
          <motion.div
            className="absolute inset-0 overflow-hidden"
            animate={reduced ? {} : { scale: ctaHovered ? 1.011 : 1 }}
            transition={{ duration: 0.88, ease: EASE_LUXE }}
            style={{ transformOrigin: "50% 46%" }}
          >
            <motion.img
              src={imageSrc}
              alt=""
              decoding="async"
              className="h-[108%] w-[108%] max-w-none -translate-x-[4%] -translate-y-[4%] object-cover"
              style={{ filter: GRADING }}
              initial={
                reduced
                  ? { opacity: 1, filter: `${GRADING} blur(0px)`, scale: 1 }
                  : { opacity: 0, filter: `${GRADING} blur(18px)`, scale: 1.042 }
              }
              animate={{ opacity: 1, filter: `${GRADING} blur(0px)`, scale: 1 }}
              transition={{
                duration: bgDuration,
                delay: t0,
                ease: EASE_LUXE,
              }}
            />
          </motion.div>

          {!reduced && (
            <motion.div
              className="pointer-events-none absolute inset-0 z-[1] bg-black/25"
              initial={{ opacity: 0.38 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 1.85, delay: t0, ease: EASE_LUXE }}
              aria-hidden
            />
          )}

          {!reduced && (
            <motion.div
              className="pointer-events-none absolute inset-[-8%] mix-blend-soft-light"
              style={{
                background:
                  "radial-gradient(ellipse 120% 90% at 0% 50%, rgba(255, 220, 175, 0.068) 0%, transparent 55%)",
              }}
              animate={{
                x: ["-18%", "22%"],
                opacity: [0.028, 0.052, 0.04, 0.056, 0.034],
              }}
              transition={{
                duration: 12,
                repeat: Infinity,
                repeatType: "mirror",
                ease: "easeInOut",
              }}
              aria-hidden
            />
          )}

          <div
            className="pointer-events-none absolute inset-0 mix-blend-multiply bg-[linear-gradient(168deg,rgba(12,8,5,0.56)_0%,transparent_38%,rgba(6,4,3,0.36)_100%)]"
            aria-hidden
          />

          <div
            className="pointer-events-none absolute inset-0 mix-blend-soft-light bg-[radial-gradient(ellipse_80%_55%_at_50%_38%,rgba(255,200,150,0.042)_0%,transparent_62%)]"
            aria-hidden
          />

          {!reduced && (
            <div
              className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(ellipse_90%_70%_at_50%_55%,rgba(255,248,235,0.032)_0%,transparent_55%)] opacity-[0.22] mix-blend-screen"
              aria-hidden
            />
          )}
        </motion.div>
      </motion.div>

      <AmbientLightLeaks />

      <VignetteStack reduced={!!reduced} />

      <div
        className="pointer-events-none absolute inset-0 z-[7] mix-blend-overlay opacity-[0.038]"
        style={{
          backgroundImage: GRAIN_BG,
          backgroundRepeat: "repeat",
          backgroundSize: "180px 180px",
        }}
        aria-hidden
      />

      <LuxuryHeroFrame baseDelay={tFrame} segmentDuration={1.12} />

      <motion.div
        className="relative z-10 h-full min-h-[100dvh] w-full pointer-events-auto"
        style={{ x: contentTx, y: contentTy }}
      >
        <motion.div
          className="flex h-full min-h-[100dvh] w-full flex-col px-6 sm:px-10"
          animate={
            reduced
              ? {}
              : {
                  x: [0, 1.6, -1, -1.5, 0.9, 0],
                  y: [0, -0.9, 1.1, -1.2, 0.5, 0],
                }
          }
          transition={{ duration: 56, repeat: Infinity, ease: "easeInOut" }}
        >
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-0 pb-[min(6vh,2.75rem)] pt-8 sm:pb-[min(7vh,3rem)] sm:pt-12">
          <div className="relative flex w-full max-w-[min(40rem,92vw)] flex-col items-center">
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 top-[18%] rounded-[2rem] bg-gradient-to-t from-black/50 via-black/16 to-transparent blur-2xl"
              aria-hidden
            />
            <div className="relative z-[1] flex flex-col items-center gap-y-2.5 sm:gap-y-3">
              <motion.div
                className="flex max-w-[min(92vw,560px)] justify-center"
                initial={
                  reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduced ? 0.15 : 1,
                  delay: tLogo,
                  ease: EASE_OUT,
                }}
              >
                <motion.div
                  className="relative"
                  animate={
                    reduced
                      ? {}
                      : {
                          y: [0, -2.5, 0],
                        }
                  }
                  transition={{
                    duration: 5.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: tLogo + 0.2,
                  }}
                >
                  <img
                    src={logoSrc}
                    alt=""
                    className="relative z-[1] block h-auto w-[min(376px,82vw)] max-w-full object-contain [backface-visibility:hidden] [image-rendering:auto] brightness-[1.1] contrast-[1.12] saturate-[1.04] drop-shadow-[0_2px_1px_rgba(255,224,175,0.12)] drop-shadow-[0_6px_32px_rgba(0,0,0,0.52)] drop-shadow-[0_0_48px_rgba(200,165,95,0.045)] sm:w-[min(494px,58vw)]"
                    decoding="async"
                  />
                </motion.div>
              </motion.div>

              {tagline ? (
                <motion.p
                  className="m-0 max-w-[min(34ch,90vw)] text-center font-['Cormorant_Garamond',Georgia,serif] text-[11px] font-light uppercase leading-snug tracking-[0.36em] text-white/50 sm:text-xs sm:tracking-[0.4em]"
                  initial={
                    reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reduced ? 0.12 : 0.9,
                    delay: tTagline,
                    ease: EASE_OUT,
                  }}
                >
                  {tagline}
                </motion.p>
              ) : null}

              <motion.div
                className="mt-1 sm:mt-1.5"
                initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduced ? 0.15 : 1.05,
                  delay: tCta,
                  ease: EASE_OUT,
                }}
              >
                {(() => {
                  const ctaClass =
                    "group relative z-[25] inline-flex min-h-[46px] min-w-[13.75rem] cursor-pointer translate-y-0 items-center justify-center gap-2 overflow-hidden border border-[rgba(228,202,138,0.58)] bg-[linear-gradient(180deg,rgba(32,22,14,0.58)_0%,rgba(10,8,6,0.72)_48%,rgba(22,16,11,0.52)_100%)] px-[2.65rem] py-3 font-['Marcellus',Georgia,serif] text-[10px] font-normal uppercase tracking-[0.5em] text-gold-light shadow-[inset_0_1px_0_rgba(255,248,235,0.06),inset_0_-12px_28px_rgba(0,0,0,0.22),0_2px_14px_rgba(0,0,0,0.38)] backdrop-blur-md transition-[transform,box-shadow,background-color,border-color,color] duration-[820ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[2px] hover:border-[rgba(238,218,165,0.72)] hover:bg-[linear-gradient(180deg,rgba(38,28,18,0.62)_0%,rgba(14,11,8,0.78)_52%,rgba(26,20,14,0.55)_100%)] hover:text-[#f0e6d4] hover:shadow-[inset_0_1px_0_rgba(255,250,235,0.09),0_10px_40px_rgba(0,0,0,0.42),0_0_0_1px_rgba(215,190,130,0.35),0_0_32px_rgba(195,165,88,0.11)] sm:min-w-[15.5rem] sm:px-[3rem] sm:text-[11px] sm:tracking-[0.54em]";
                  const ctaChildren = (
                    <>
                      <span
                        className="pointer-events-none absolute inset-0 opacity-0 mix-blend-soft-light transition-opacity duration-[820ms] group-hover:opacity-100"
                        style={{
                          background:
                            "linear-gradient(105deg, transparent 34%, rgba(255,236,205,0.26) 50%, transparent 66%)",
                        }}
                        aria-hidden
                      />
                      <span
                        className="pointer-events-none absolute inset-0 translate-x-[-120%] skew-x-[-12deg] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent opacity-0 transition-[transform,opacity] duration-0 group-hover:translate-x-[120%] group-hover:opacity-100 group-hover:duration-[1100ms] group-hover:ease-out"
                        aria-hidden
                      />
                      <span
                        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px origin-left scale-x-0 bg-gradient-to-r from-transparent via-[rgba(236,210,150,0.5)] to-transparent transition-transform duration-[1000ms] ease-out group-hover:scale-x-100"
                        aria-hidden
                      />
                      <span className="relative z-[1]">{ctaLabel}</span>
                      <span
                        className="relative z-[1] text-[0.85em] font-normal opacity-80 transition duration-[820ms] group-hover:translate-x-0.5 group-hover:opacity-100"
                        aria-hidden
                      >
                        →
                      </span>
                    </>
                  );
                  if (onCtaClick) {
                    return (
                      <motion.button
                        type="button"
                        onClick={() => onCtaClick()}
                        onHoverStart={() => setCtaHovered(true)}
                        onHoverEnd={() => setCtaHovered(false)}
                        className={ctaClass}
                        whileTap={{ scale: 0.988 }}
                        transition={{ duration: 0.78, ease: EASE_LUXE }}
                      >
                        {ctaChildren}
                      </motion.button>
                    );
                  }
                  return (
                    <motion.a
                      href={ctaHref}
                      onHoverStart={() => setCtaHovered(true)}
                      onHoverEnd={() => setCtaHovered(false)}
                      className={ctaClass}
                      whileTap={{ scale: 0.988 }}
                      transition={{ duration: 0.78, ease: EASE_LUXE }}
                    >
                      {ctaChildren}
                    </motion.a>
                  );
                })()}
              </motion.div>
            </div>
          </div>
        </div>

        {children}
        </motion.div>
      </motion.div>

      <motion.div
        className="pointer-events-none absolute inset-0 z-[11]"
        style={{ x: dustTx, y: dustTy }}
      >
        <IntroDustMotes reduced={!!reduced} placement="hero" />
      </motion.div>
    </section>
  );
}
