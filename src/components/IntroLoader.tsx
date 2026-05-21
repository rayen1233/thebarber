import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import logoSrc from "../../logo.png";
import { IntroDustMotes } from "./IntroDustMotes";

/** Timeline: hold → build → shine @2.4s → hold → fade @3.6s (900ms) */
const FADE_OUT_START_MS = 3600;
const DISSOLVE_DURATION_S = 0.9;

const EASE_LUXE = [0.22, 0.08, 0.18, 1] as const;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const BASE_GONE_MS = 1950;

const FILTER_START =
  "blur(8px) brightness(0.65) contrast(1.05) saturate(0.9)";
const FILTER_MID =
  "blur(0px) brightness(1.28) contrast(1.14) saturate(1.08)";
const FILTER_RICH =
  "blur(0px) brightness(1.78) contrast(1.12) saturate(1.14)";

const SHINE_DELAY_S = 2.4;
const SHINE_DURATION_S = 0.5;
const SPARKLE_DELAY_S = 2.92;
const SPARKLE_DURATION_S = 0.2;

const METAL_FLOW_BG = `linear-gradient(
  118deg,
  rgba(110, 88, 48, 0) 0%,
  rgba(150, 125, 72, 0.14) 40%,
  rgba(255, 248, 220, 0.22) 50%,
  rgba(140, 118, 68, 0.12) 60%,
  rgba(110, 88, 48, 0) 100%
)`;

type IntroLoaderProps = {
  onComplete: () => void;
};

const maskFromLogo = (src: string) =>
  ({
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  }) as const;

/** Original atmospheric smoke (3 plumes, linear drift) */
function SmokeField({ reduced }: { reduced: boolean }) {
  const plumes = useMemo(
    () =>
      [
        { x: "18%", y: "38%", w: "85%", h: "70%", blur: 88, dur: 14, dx: 12 },
        { x: "62%", y: "52%", w: "75%", h: "65%", blur: 96, dur: 18, dx: -10 },
        { x: "44%", y: "28%", w: "90%", h: "55%", blur: 100, dur: 16, dx: 8 },
      ] as const,
    [],
  );

  if (reduced) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 45%, rgba(38,36,42,0.6) 0%, transparent 65%)",
          filter: "blur(80px)",
        }}
      />
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {plumes.map((p, i) => (
        <div
          key={i}
          className="pointer-events-none absolute"
          style={{
            left: p.x,
            top: p.y,
            width: p.w,
            height: p.h,
            transform: "translate(-50%, -50%)",
          }}
        >
          <motion.div
            aria-hidden
            className="absolute inset-0 mix-blend-normal"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(42,40,46,0.55) 0%, rgba(10,10,12,0.2) 45%, transparent 70%)",
              filter: `blur(${p.blur}px)`,
              opacity: 0.045,
            }}
            animate={{
              x: [0, p.dx, 0],
              y: [0, (i % 2) * 6 - 3, 0],
              opacity: [0.028, 0.055, 0.032],
            }}
            transition={{
              duration: p.dur,
              repeat: Infinity,
              ease: "linear",
              delay: i * 0.1,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function LogoMetalFlow({ reduced }: { reduced: boolean }) {
  if (reduced) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-[-5%] z-[3] mix-blend-soft-light"
      style={{
        background: METAL_FLOW_BG,
        backgroundSize: "240% 100%",
        backgroundPosition: "72% 50%",
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: [0, 0.34, 0.28, 0],
        backgroundPosition: ["72% 50%", "58% 50%", "40% 50%", "28% 50%"],
      }}
      transition={{
        duration: 2,
        delay: 0.4,
        ease: EASE_LUXE,
        times: [0, 0.18, 0.82, 1],
      }}
    />
  );
}

function LogoShineLine({ reduced }: { reduced: boolean }) {
  if (reduced) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute z-[4]"
      style={{
        top: "50%",
        width: "18%",
        height: "160%",
        rotate: 24,
        transformOrigin: "center center",
        mixBlendMode: "screen",
      }}
      initial={{ left: "-40%", y: "-50%", opacity: 1 }}
      animate={{
        left: ["-40%", "108%", "120%"],
        y: ["-50%", "-50%", "-50%"],
        opacity: [1, 1, 0],
      }}
      transition={{
        delay: SHINE_DELAY_S,
        duration: SHINE_DURATION_S,
        ease: [0.25, 0.1, 0.2, 1],
        times: [0, 0.78, 1],
      }}
    >
      <div
        className="h-full w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.65), rgba(212,175,55,0.35), transparent)",
          filter: "blur(8px)",
        }}
      />
    </motion.div>
  );
}

function LogoSparkle({ reduced }: { reduced: boolean }) {
  if (reduced) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute z-[5]"
      style={{
        left: "62%",
        top: "40%",
        width: 10,
        height: 10,
        marginLeft: -5,
        marginTop: -5,
        borderRadius: "50%",
        mixBlendMode: "screen",
        background:
          "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,228,175,0.55) 38%, transparent 72%)",
        filter: "blur(0.45px)",
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: [0, 1, 0],
        scale: [0.5, 1.05, 0.85],
      }}
      transition={{
        delay: SPARKLE_DELAY_S,
        duration: SPARKLE_DURATION_S,
        ease: "easeOut",
        times: [0, 0.4, 1],
      }}
    />
  );
}

export function IntroLoader({ onComplete }: IntroLoaderProps) {
  const [mounted, setMounted] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [baseGone, setBaseGone] = useState(false);
  const reduceMotion = useReducedMotion();
  const reduced = !!reduceMotion;

  useEffect(() => {
    const t = window.setTimeout(() => setFadeOut(true), FADE_OUT_START_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!fadeOut) return;
    const id = window.setTimeout(() => {
      setMounted(false);
      onComplete();
    }, DISSOLVE_DURATION_S * 1000 + 100);
    return () => window.clearTimeout(id);
  }, [fadeOut, onComplete]);

  useEffect(() => {
    if (reduced) return;
    const id = window.setTimeout(() => setBaseGone(true), BASE_GONE_MS);
    return () => window.clearTimeout(id);
  }, [reduced]);

  if (!mounted) return null;

  const logoShell =
    "relative isolate z-[3] flex min-h-[min(40vh,200px)] w-[min(72vw,280px)] max-w-full items-center justify-center sm:min-h-[min(38vh,240px)] sm:w-[min(52vw,320px)]";

  const imgFit =
    "absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 object-contain";

  return (
    <motion.div
      className={`fixed inset-0 z-[100] overflow-hidden bg-black ${fadeOut ? "pointer-events-none" : ""}`}
      initial={{ opacity: 1 }}
      animate={{ opacity: fadeOut ? 0 : 1 }}
      transition={{
        duration: DISSOLVE_DURATION_S,
        ease: EASE_OUT,
      }}
    >
      <SmokeField reduced={reduced} />
      <motion.div
        className="absolute inset-0 z-[2] flex items-center justify-center"
        style={{ perspective: 1400 }}
        initial={false}
      >
        {/* Dust lives inside the camera stack so it paints with the logo layer (not buried under a full-screen composited pane). */}
        <IntroDustMotes reduced={reduced} placement="intro" className="z-0" />
        <motion.div
          className="relative z-[1] flex min-h-[min(72vh,520px)] w-full max-w-[min(92vw,480px)] flex-col items-center justify-center px-5 sm:px-8"
          initial={{ y: reduced ? 0 : 9 }}
          animate={{ y: 0 }}
          transition={{
            delay: reduced ? 0 : 0.4,
            duration: reduced ? 0.2 : 1.4,
            ease: EASE_LUXE,
          }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {!logoFailed ? (
            <motion.div
              className={`${logoShell} z-[2] origin-center`}
              style={maskFromLogo(logoSrc)}
              initial={{ scale: reduced ? 1 : 0.94 }}
              animate={{ scale: 1 }}
              transition={{
                delay: reduced ? 0 : 0.4,
                duration: reduced ? 0.2 : 1.4,
                ease: EASE_LUXE,
              }}
            >
              <motion.img
                src={logoSrc}
                alt=""
                aria-hidden
                draggable={false}
                className={`${imgFit} z-[1] select-none`}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: reduced ? 0.08 : baseGone ? 0 : 0.08,
                }}
                transition={{
                  delay: reduced || baseGone ? 0 : 0.4,
                  duration: reduced ? 0.2 : baseGone ? 0.35 : 1.2,
                  ease: "easeOut",
                }}
                style={{
                  filter: "brightness(0.38) contrast(1.02) saturate(0.88)",
                }}
                onError={() => setLogoFailed(true)}
              />

              <motion.img
                src={logoSrc}
                alt=""
                draggable={false}
                className={`${imgFit} z-[2] select-none`}
                initial={
                  reduced
                    ? { opacity: 1, filter: FILTER_RICH }
                    : { opacity: 0, filter: FILTER_START }
                }
                animate={
                  reduced
                    ? { opacity: 1, filter: FILTER_RICH }
                    : {
                        opacity: [0, 0, 1, 1],
                        filter: [
                          FILTER_START,
                          FILTER_START,
                          FILTER_MID,
                          FILTER_RICH,
                        ],
                      }
                }
                transition={
                  reduced
                    ? { duration: 0.2 }
                    : {
                        duration: 2.4,
                        ease: EASE_LUXE,
                        times: [0, 0.166667, 0.75, 1],
                      }
                }
                onError={() => setLogoFailed(true)}
              />

              <LogoMetalFlow reduced={reduced} />
              <LogoShineLine reduced={reduced} />
              <LogoSparkle reduced={reduced} />
            </motion.div>
          ) : (
            <div className={`${logoShell} z-[2]`}>
              <div
                className="h-[min(22vh,120px)] w-[min(64vw,240px)] rounded-sm border border-gold/20 bg-gradient-to-b from-white/[0.03] to-transparent sm:h-[min(20vh,140px)] sm:w-[min(48vw,280px)]"
                aria-hidden
              />
            </div>
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
