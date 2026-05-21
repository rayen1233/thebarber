import { motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ORDER_CATEGORIES } from "./categoriesData";
import { getSplitCrossPercents, getSplitRects } from "./splitLayout";
import { SplitCategoryPanel } from "./SplitCategoryPanel";

const EASE = [0.22, 0.08, 0.18, 1] as const;

export type OrderSplitPageProps = {
  onBackToHero: () => void;
};

export function OrderSplitPage({ onBackToHero }: OrderSplitPageProps) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const [coarse, setCoarse] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const rects = useMemo(() => getSplitRects(hovered), [hovered]);
  const cross = useMemo(() => getSplitCrossPercents(hovered), [hovered]);

  const onRootLeave = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const rel = e.relatedTarget as Node | null;
      if (rel && rootRef.current?.contains(rel)) return;
      setHovered(null);
    },
    [],
  );

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div className="relative min-h-[100dvh] w-full bg-black text-neutral-100">
      <button
        type="button"
        onClick={onBackToHero}
        className="absolute left-4 top-4 z-[80] font-['Marcellus',Georgia,serif] text-[10px] font-normal uppercase tracking-[0.42em] text-gold-light/85 transition hover:text-gold-light sm:left-8 sm:top-7 sm:text-[11px]"
      >
        ← Retour
      </button>

      <div
        ref={rootRef}
        className="absolute inset-0 z-[10]"
        onPointerLeave={onRootLeave}
      >
        {ORDER_CATEGORIES.map((category, index) => (
          <SplitCategoryPanel
            key={category.id}
            category={category}
            index={index}
            rect={rects[index]!}
            hovered={hovered === index}
            anyHover={hovered !== null}
            reducedMotion={!!reduced}
            coarsePointer={coarse}
            onEnter={() => setHovered(index)}
            entranceIndex={index}
          />
        ))}

        <motion.div
          className="pointer-events-none absolute top-0 z-[35] h-full w-[2px] origin-top overflow-hidden"
          initial={{ scaleY: 0 }}
          animate={{
            scaleY: 1,
            left: `calc(${cross.vx}% - 1px)`,
          }}
          transition={{
            scaleY: { duration: 1.05, delay: 0.35, ease: EASE },
            left: { duration: 0.88, ease: EASE },
          }}
          aria-hidden
        >
          <div
            className="h-full w-full animate-split-shine-v bg-gradient-to-b from-transparent via-[rgba(230,210,160,0.42)] to-transparent"
            style={{ backgroundSize: "100% 220%" }}
          />
        </motion.div>
        <motion.div
          className="pointer-events-none absolute left-0 z-[35] h-[2px] w-full origin-left overflow-hidden"
          initial={{ scaleX: 0 }}
          animate={{
            scaleX: 1,
            top: `calc(${cross.hy}% - 1px)`,
          }}
          transition={{
            scaleX: { duration: 1.05, delay: 0.35, ease: EASE },
            top: { duration: 0.88, ease: EASE },
          }}
          aria-hidden
        >
          <div
            className="h-full w-full animate-split-shine-h bg-gradient-to-r from-transparent via-[rgba(230,210,160,0.42)] to-transparent"
            style={{ backgroundSize: "220% 100%" }}
          />
        </motion.div>
      </div>

      <motion.div
        className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_100%_100%_at_50%_50%,transparent_35%,rgba(0,0,0,0.35)_100%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.1, delay: 0.2, ease: EASE }}
        aria-hidden
      />
    </div>
  );
}
