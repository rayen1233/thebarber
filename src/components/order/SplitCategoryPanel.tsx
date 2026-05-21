import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OrderCategoryDef } from "./categoriesData";
import type { PanelRect } from "./splitLayout";
import { resolveFirstUrl } from "./resolveFirstUrl";

const EASE = [0.22, 0.08, 0.18, 1] as const;

/** Match intro showroom: unified LUT-style grade per quadrant (cohesive universe). */
const PANEL_IMG_FILTERS = [
  "brightness(0.72) contrast(1.08) saturate(0.68) sepia(0.18) hue-rotate(-6deg)",
  "brightness(0.76) contrast(1.09) saturate(0.7) sepia(0.15) hue-rotate(-4deg)",
  "brightness(0.88) contrast(1.14) saturate(0.78) sepia(0.12) hue-rotate(-2deg)",
  "brightness(0.78) contrast(1.11) saturate(0.7) sepia(0.15) hue-rotate(-3deg)",
] as const;

const PANEL_OBJECT_POSITION = ["48% 44%", "52% 46%", "48% 52%", "50% 48%"] as const;

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function PanelDust({ reduced }: { reduced: boolean }) {
  const specs = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        left: `${(i * 19 + 8) % 86}%`,
        top: `${(i * 23 + 10) % 78}%`,
        dur: 5.2 + (i % 3) * 0.5,
        op: 0.035 + (i % 3) * 0.012,
      })),
    [],
  );
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[13] mix-blend-screen opacity-[0.34]"
      aria-hidden
    >
      {specs.map((s) => (
        <motion.span
          key={s.id}
          className="absolute h-[2px] w-[2px] rounded-full bg-[#f0e6d8]"
          style={{
            left: s.left,
            top: s.top,
            boxShadow: "0 0 4px rgba(210,185,120,0.1)",
            filter: "blur(0.4px)",
          }}
          animate={
            reduced
              ? { opacity: s.op }
              : { opacity: [s.op * 0.7, s.op * 1.25, s.op * 0.85] }
          }
          transition={{
            duration: reduced ? 0.01 : s.dur,
            repeat: reduced ? 0 : Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export type SplitCategoryPanelProps = {
  category: OrderCategoryDef;
  index: number;
  rect: PanelRect;
  hovered: boolean;
  anyHover: boolean;
  reducedMotion: boolean;
  coarsePointer: boolean;
  onEnter: () => void;
  entranceIndex: number;
};

export function SplitCategoryPanel({
  category,
  index: _index,
  rect,
  hovered,
  anyHover,
  reducedMotion,
  coarsePointer: _coarsePointer,
  onEnter,
  entranceIndex,
}: SplitCategoryPanelProps) {
  void _coarsePointer;

  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgOk, setBgOk] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let c = false;
    resolveFirstUrl(category.backgroundUrls).then((u) => {
      if (!c) {
        setBgUrl(u);
        if (!u) setBgOk(false);
      }
    });
    return () => {
      c = true;
    };
  }, [category.backgroundUrls]);

  const peerDim = anyHover && !hovered;
  const enterDelay = reducedMotion ? 0 : entranceIndex * 0.1;
  const titleEnterDelay = reducedMotion ? 0 : 0.4 + enterDelay;
  const ctaEnterDelay = titleEnterDelay + 0.22;
  const panelTransition = reducedMotion
    ? { duration: 0.2, ease: EASE }
    : ({
        left: { duration: 0.88, ease: EASE },
        top: { duration: 0.88, ease: EASE },
        width: { duration: 0.88, ease: EASE },
        height: { duration: 0.88, ease: EASE },
        opacity: { duration: 0.58, delay: enterDelay, ease: EASE },
        zIndex: { duration: 0.35 },
        boxShadow: { duration: 0.65, ease: EASE },
      } as const);

  return (
    <motion.article
      ref={rootRef}
      data-split-panel
      className="absolute overflow-hidden bg-black"
      initial={{ opacity: reducedMotion ? 1 : 0 }}
      animate={{
        left: `${rect.l}%`,
        top: `${rect.t}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
        opacity: 1,
        zIndex: hovered ? 18 : 2,
        boxShadow: hovered
          ? "inset 0 0 0 1px rgba(230,205,150,0.42), 0 0 80px rgba(190,160,85,0.14)"
          : "inset 0 0 0 1px rgba(210,185,120,0.12)",
      }}
      transition={panelTransition}
      onPointerEnter={onEnter}
    >
      <motion.div
        className="absolute inset-0 z-0 overflow-hidden"
        animate={{ scale: hovered ? 1.085 : peerDim ? 0.985 : 1 }}
        transition={{ duration: 1.12, ease: EASE }}
      >
        {bgOk && bgUrl ? (
          <>
            <img
              src={bgUrl}
              alt=""
              className="h-full w-full scale-[1.04] object-cover"
              style={{
                objectPosition: PANEL_OBJECT_POSITION[_index % 4],
                filter: PANEL_IMG_FILTERS[_index % 4],
              }}
              loading="lazy"
              decoding="async"
              onError={() => setBgOk(false)}
            />
            <motion.div
              className="pointer-events-none absolute inset-0 z-[1] mix-blend-multiply"
              style={{
                background:
                  "linear-gradient(168deg, rgba(26,17,11,0.55) 0%, rgba(10,8,6,0.22) 44%, rgba(20,14,9,0.62) 100%), radial-gradient(ellipse 96% 82% at 50% 52%, rgba(58,42,28,0.3) 0%, transparent 58%)",
              }}
              animate={{ opacity: hovered ? 0.76 : peerDim ? 0.94 : 0.92 }}
              transition={{ duration: 0.75, ease: EASE }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 z-[2] mix-blend-screen opacity-[0.48]"
              style={{
                background:
                  "radial-gradient(circle at 22% 28%, rgba(255,232,200,0.1) 0%, transparent 44%), radial-gradient(circle at 82% 70%, rgba(210,175,105,0.07) 0%, transparent 40%)",
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 z-[3] mix-blend-overlay opacity-[0.05]"
              style={{
                backgroundImage: GRAIN_SVG,
                backgroundSize: "180px 180px",
              }}
              aria-hidden
            />
          </>
        ) : null}
        <div
          className={`absolute inset-0 z-[4] bg-gradient-to-br from-[#0a0806] to-[#030201] ${bgOk ? "opacity-0" : "opacity-100"}`}
          aria-hidden
        />
      </motion.div>

      <motion.div
        className="absolute inset-0 z-[10] bg-[radial-gradient(ellipse_72%_62%_at_50%_44%,transparent_0%,rgba(0,0,0,0.36)_50%,rgba(0,0,0,0.8)_100%),linear-gradient(175deg,rgba(18,12,8,0.4)_0%,transparent_38%,rgba(8,6,4,0.42)_100%)]"
        animate={{ opacity: hovered ? 0.48 : peerDim ? 0.76 : 0.66 }}
        transition={{ duration: 0.72, ease: EASE }}
        aria-hidden
      />

      <div
        className="pointer-events-none absolute inset-0 z-[11] bg-[radial-gradient(ellipse_112%_112%_at_50%_50%,transparent_34%,rgba(0,0,0,0.26)_70%,rgba(0,0,0,0.52)_100%)] shadow-[inset_0_0_56px_rgba(0,0,0,0.5)]"
        aria-hidden
      />

      <motion.div
        className={`pointer-events-none absolute inset-0 z-[12] backdrop-blur-md backdrop-saturate-[0.82] ${
          _index % 2 === 0
            ? "[mask-image:linear-gradient(90deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.5)_26%,transparent_64%)] [-webkit-mask-image:linear-gradient(90deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.5)_26%,transparent_64%)]"
            : "[mask-image:linear-gradient(270deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.5)_26%,transparent_64%)] [-webkit-mask-image:linear-gradient(270deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.5)_26%,transparent_64%)]"
        }`}
        animate={{
          opacity: hovered ? 0.52 : peerDim ? 0.28 : 0.4,
        }}
        transition={{ duration: 0.72, ease: EASE }}
        aria-hidden
      />

      <PanelDust reduced={reducedMotion} />

      <div
        className={`relative z-[20] flex h-full min-h-0 w-full flex-row items-stretch ${
          _index % 2 === 1 ? "flex-row-reverse" : ""
        }`}
      >
        <div
          className={`pointer-events-none flex w-[min(38%,12rem)] shrink-0 flex-col justify-end pb-[min(5.5vh,2.75rem)] pt-[min(14vh,5.5rem)] ${
            _index % 2 === 1
              ? "items-end pr-[clamp(0.85rem,2.6vw,1.35rem)] pl-1 text-right"
              : "items-start pl-[clamp(0.85rem,2.6vw,1.35rem)] pr-1 text-left"
          }`}
        >
          {category.subtitle ? (
            <motion.p
              className="mb-1 font-['Cormorant_Garamond',Georgia,serif] text-[10px] font-light uppercase tracking-[0.32em] text-white/45 sm:text-[11px]"
              animate={{ opacity: hovered ? 0.95 : peerDim ? 0.35 : 0.55 }}
              transition={{ duration: 0.55, ease: EASE }}
            >
              {category.subtitle}
            </motion.p>
          ) : null}
          <motion.h2
            className="origin-bottom font-['Cormorant_Garamond','Playfair_Display',Georgia,serif] text-[clamp(2rem,8vw,3.5rem)] font-medium leading-[1.05] tracking-[0.02em] text-[rgba(252,248,238,0.94)] lg:text-[clamp(2.6rem,5vw,5.5rem)]"
            initial={
              reducedMotion
                ? false
                : { opacity: 0, filter: "blur(12px)", marginTop: "0.5em" }
            }
            animate={{
              opacity: peerDim ? 0.52 : 1,
              marginTop: 0,
              filter: "blur(0px)",
              color: hovered ? "rgba(255,252,244,0.99)" : "rgba(252,248,238,0.94)",
              textShadow: hovered
                ? "0 2px 32px rgba(0,0,0,0.45), 0 0 48px rgba(210,180,100,0.22)"
                : "0 2px 28px rgba(0,0,0,0.55), 0 0 42px rgba(0,0,0,0.25)",
              y: hovered ? -8 : 0,
              scale: hovered ? 1.04 : 1,
            }}
            transition={{
              opacity: { delay: titleEnterDelay, duration: 0.92, ease: EASE },
              filter: { delay: titleEnterDelay, duration: 0.92, ease: EASE },
              marginTop: { delay: titleEnterDelay, duration: 0.92, ease: EASE },
              color: { duration: 0.65, ease: EASE },
              textShadow: { duration: 0.65, ease: EASE },
              y: { duration: 0.68, ease: EASE },
              scale: { duration: 0.68, ease: EASE },
            }}
          >
            {category.title}
          </motion.h2>
          <motion.button
            type="button"
            data-cursor-hover
            className="group pointer-events-auto relative mt-[clamp(0.85rem,2vh,1.25rem)] flex min-h-[48px] w-full min-w-0 cursor-pointer items-center justify-center overflow-hidden border border-[rgba(218,188,118,0.55)] bg-[rgba(6,4,3,0.58)] px-8 font-['Marcellus',Georgia,serif] text-[0.72rem] font-normal uppercase tracking-[0.32em] text-[rgba(240,228,205,0.88)] backdrop-blur-md sm:min-w-[180px]"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{
              opacity: hovered ? 1 : peerDim ? 0.32 : 0.62,
              y: hovered ? -2 : 0,
              borderColor: hovered
                ? "rgba(244,220,160,0.78)"
                : "rgba(218,188,118,0.55)",
              color: hovered ? "rgba(255,250,240,0.98)" : "rgba(240,228,205,0.88)",
              backgroundColor: hovered
                ? "rgba(32,20,12,0.68)"
                : "rgba(22,14,8,0.62)",
              boxShadow: hovered
                ? "0 12px 40px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,232,200,0.08)"
                : "0 0 0 rgba(0,0,0,0)",
            }}
            transition={{
              opacity: { delay: ctaEnterDelay, duration: 0.72, ease: EASE },
              y: { duration: 0.55, ease: EASE },
              borderColor: { duration: 0.55, ease: EASE },
              color: { duration: 0.55, ease: EASE },
              backgroundColor: { duration: 0.55, ease: EASE },
              boxShadow: { duration: 0.55, ease: EASE },
            }}
          >
            <span
              className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-transparent via-[rgba(255,238,210,0.2)] to-transparent opacity-0 group-hover:animate-split-cta-shine"
              aria-hidden
            />
            <span className="relative z-10 flex items-center justify-center gap-[0.65em]">
              <span>{category.ctaLabel}</span>
              <span className="text-[0.92em] opacity-90 transition-transform duration-500 ease-[cubic-bezier(0.22,0.08,0.18,1)] group-hover:translate-x-1">
                →
              </span>
            </span>
          </motion.button>
        </div>

        <div
          className={`flex min-h-0 min-w-0 flex-1 items-center pb-[min(10vh,4rem)] pt-[min(6vh,2.5rem)] ${
            _index % 2 === 0 ? "justify-end pr-1 sm:pr-3" : "justify-start pl-1 sm:pl-3"
          }`}
        >
          <div
            className="h-[min(28vh,240px)] w-full max-w-[min(92%,20rem)] rounded-2xl border border-white/[0.07] bg-black/25 shadow-[inset_0_1px_0_rgba(255,248,232,0.05),0_16px_48px_rgba(0,0,0,0.4)] ring-1 ring-[rgba(201,162,39,0.12)] backdrop-blur-[2px] transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,0.08,0.18,1)]"
            style={{
              transform: hovered ? "translateY(-6px) scale(1.03)" : "translateY(0) scale(1)",
              boxShadow: hovered
                ? "inset 0 1px 0 rgba(255,248,232,0.08), 0 0 48px rgba(201,162,39,0.12), 0 22px 56px rgba(0,0,0,0.48)"
                : "inset 0 1px 0 rgba(255,248,232,0.05), 0 16px 48px rgba(0,0,0,0.4)",
            }}
            aria-hidden
          />
        </div>
      </div>
    </motion.article>
  );
}
