import { motion } from "framer-motion";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuxuryHeroFrame } from "../LuxuryHeroFrame";

import type { OrderCategoryDef } from "./categoriesData";
import { resolveFirstUrl } from "./resolveFirstUrl";

const EASE = [0.22, 0.08, 0.18, 1] as const;

function CardDust({ reduced }: { reduced: boolean }) {
  const specs = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: i,
        left: `${(i * 17 + 9) % 88}%`,
        top: `${(i * 23 + 6) % 82}%`,
        delay: i * 0.35,
        dur: 5.5 + (i % 3) * 0.4,
        op: 0.04 + (i % 4) * 0.018,
      })),
    [],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[8] overflow-hidden mix-blend-screen opacity-[0.35]"
      aria-hidden
    >
      {specs.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full bg-[#f2eadc]"
          style={{
            left: s.left,
            top: s.top,
            width: 2,
            height: 2,
            boxShadow: "0 0 4px rgba(210,185,120,0.12)",
            filter: "blur(0.35px)",
          }}
          animate={
            reduced
              ? { opacity: s.op }
              : {
                  opacity: [s.op * 0.7, s.op * 1.35, s.op * 0.85],
                  y: [0, -3, 0],
                }
          }
          transition={{
            duration: reduced ? 0.01 : s.dur,
            repeat: reduced ? 0 : Infinity,
            ease: "easeInOut",
            delay: s.delay * 0.01,
          }}
        />
      ))}
    </div>
  );
}

export type OrderCategoryCardProps = {
  category: OrderCategoryDef;
  index: number;
  hoveredIndex: number | null;
  onHoverChange: Dispatch<SetStateAction<number | null>>;
  reducedMotion: boolean;
  isCoarsePointer: boolean;
};

export function OrderCategoryCard({
  category,
  index,
  hoveredIndex,
  onHoverChange,
  reducedMotion,
  isCoarsePointer,
}: OrderCategoryCardProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgFailed, setBgFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveFirstUrl(category.backgroundUrls).then((url) => {
      if (!cancelled) setBgUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [category.backgroundUrls]);

  const isHovered = hoveredIndex === index;
  const peerDim =
    hoveredIndex !== null && hoveredIndex !== index && !isCoarsePointer;

  return (
    <motion.article
      ref={rootRef}
      layout
      transition={{
        layout: { duration: 0.68, ease: EASE },
        default: { duration: 0.55, ease: EASE },
      }}
      className="relative isolate flex min-h-[min(52vh,28rem)] flex-col overflow-hidden rounded-[2px] border border-[rgba(200,175,115,0.28)] bg-[#060403] shadow-[0_0_0_1px_rgba(0,0,0,0.5)] md:min-h-0"
      initial={false}
      animate={{
        scale: isHovered ? 1.04 : peerDim ? 0.965 : 1,
        opacity: peerDim ? 0.72 : 1,
        filter: peerDim ? "brightness(0.62)" : "brightness(1)",
        zIndex: isHovered ? 5 : 1,
        boxShadow: isHovered
          ? "0 0 0 1px rgba(215,190,130,0.35), 0 18px 48px rgba(0,0,0,0.55), 0 0 42px rgba(180,150,80,0.08)"
          : "0 0 0 1px rgba(0,0,0,0.45), 0 8px 28px rgba(0,0,0,0.35)",
      }}
      onHoverStart={() => {
        if (!isCoarsePointer) onHoverChange(index);
      }}
      onHoverEnd={() => {
        onHoverChange((h) => (h === index ? null : h));
      }}
      onTap={() => {
        if (isCoarsePointer) onHoverChange(isHovered ? null : index);
      }}
    >
      <motion.div
        className="absolute inset-0 z-0"
        animate={{ scale: isHovered ? 1.06 : 1 }}
        transition={{ duration: 0.75, ease: EASE }}
      >
        {!bgFailed && bgUrl ? (
          <img
            src={bgUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setBgFailed(true)}
          />
        ) : null}
        <div
          className={`absolute inset-0 bg-gradient-to-br from-[#0a0806] via-[#050403]/88 to-[#020101]/95 ${bgFailed ? "opacity-100" : ""}`}
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_38%,transparent_0%,rgba(0,0,0,0.55)_55%,rgba(0,0,0,0.88)_100%)]"
          aria-hidden
        />
        <div
          className="absolute inset-0 mix-blend-soft-light bg-[radial-gradient(ellipse_55%_45%_at_50%_42%,rgba(255,220,175,0.06)_0%,transparent_62%)]"
          aria-hidden
        />
      </motion.div>

      <LuxuryHeroFrame
        baseDelay={0}
        segmentDuration={0.72}
        className="!inset-3 z-[11] sm:!inset-5"
      />
      <CardDust reduced={reducedMotion} />

      <div
        className="pointer-events-none absolute inset-0 z-[9] bg-[radial-gradient(ellipse_100%_100%_at_50%_50%,transparent_35%,rgba(0,0,0,0.35)_100%)]"
        aria-hidden
      />

      <div className="relative z-[20] flex flex-1 flex-col items-center px-4 pb-6 pt-7 sm:px-6 sm:pb-8 sm:pt-9">
        <motion.div
          className="relative flex w-full max-w-[min(100%,20rem)] flex-1 items-center justify-center"
          animate={{
            minHeight: isHovered ? 260 : 200,
            opacity: isHovered ? 1 : 0.92,
          }}
          transition={{ duration: 0.65, ease: EASE }}
        >
          <div
            className="flex h-full min-h-[200px] w-full flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-black/30 px-6 py-10 shadow-[inset_0_1px_0_rgba(255,248,232,0.06),0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-[rgba(201,162,39,0.14)] backdrop-blur-[2px] transition-[box-shadow,transform,border-color] duration-[0.55s] ease-[cubic-bezier(0.22,0.08,0.18,1)]"
            style={{
              transform: isHovered ? "translateY(-4px) scale(1.02)" : "translateY(0) scale(1)",
              boxShadow: isHovered
                ? "inset 0 1px 0 rgba(255,248,232,0.1), 0 0 44px rgba(201,162,39,0.14), 0 20px 52px rgba(0,0,0,0.48)"
                : "inset 0 1px 0 rgba(255,248,232,0.06), 0 12px 40px rgba(0,0,0,0.35)",
              borderColor: isHovered ? "rgba(232,210,160,0.22)" : "rgba(255,255,255,0.08)",
            }}
            aria-hidden
          />
        </motion.div>

        <motion.h2
          className="mt-4 max-w-[16ch] text-center font-['Marcellus',Georgia,serif] text-[1.35rem] font-normal leading-tight tracking-[0.08em] text-white/90 sm:mt-5 sm:text-2xl md:text-[1.65rem]"
          animate={{
            color: isHovered ? "rgba(255,248,235,0.96)" : "rgba(245,240,230,0.82)",
            textShadow: isHovered
              ? "0 0 28px rgba(210,180,100,0.12)"
              : "0 0 0 transparent",
          }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          {category.title}
        </motion.h2>

        <motion.button
          type="button"
          className="mt-4 border border-[rgba(200,175,115,0.38)] bg-black/35 px-6 py-2 font-['Marcellus',Georgia,serif] text-[9px] font-normal uppercase tracking-[0.42em] text-gold-light/95 backdrop-blur-md transition hover:border-[rgba(220,195,130,0.55)] hover:bg-black/45 sm:mt-5 sm:text-[10px] sm:tracking-[0.48em]"
          whileTap={{ scale: 0.985 }}
        >
          {category.ctaLabel}
        </motion.button>
      </div>
    </motion.article>
  );
}
