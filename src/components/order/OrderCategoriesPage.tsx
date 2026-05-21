import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { ORDER_CATEGORIES } from "./categoriesData";
import { OrderCategoryCard } from "./OrderCategoryCard";

const EASE = [0.22, 0.08, 0.18, 1] as const;

export type OrderCategoriesPageProps = {
  onBackToHero: () => void;
};

export function OrderCategoriesPage({ onBackToHero }: OrderCategoriesPageProps) {
  const reduced = useReducedMotion();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-neutral-100">
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_72%_58%_at_50%_36%,transparent_0%,rgba(0,0,0,0.55)_58%,rgba(0,0,0,0.92)_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(to_right,rgba(0,0,0,0.5)_0%,transparent_12%,transparent_88%,rgba(0,0,0,0.5)_100%)]"
        aria-hidden
      />

      <header className="relative z-[30] flex items-center justify-between px-4 py-5 sm:px-8 sm:py-7">
        <button
          type="button"
          onClick={onBackToHero}
          className="font-['Marcellus',Georgia,serif] text-[10px] font-normal uppercase tracking-[0.42em] text-gold-light/85 transition hover:text-gold-light sm:text-[11px] sm:tracking-[0.48em]"
        >
          ← Retour
        </button>
        <p className="hidden text-center font-['Cormorant_Garamond',Georgia,serif] text-xs font-light uppercase tracking-[0.38em] text-white/45 sm:block">
          Espace commande
        </p>
        <span className="w-[4.5rem] sm:w-[5.5rem]" aria-hidden />
      </header>

      <motion.main
        layoutRoot
        className="relative z-[20] mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-3 pb-10 pt-2 sm:px-6 sm:pb-14 sm:pt-4"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: { staggerChildren: 0.11, delayChildren: 0.12 },
          },
        }}
      >
        <div className="grid flex-1 grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 md:grid-rows-2 md:gap-5 md:[grid-auto-rows:minmax(0,1fr)]">
          {ORDER_CATEGORIES.map((category, index) => (
            <motion.div
              key={category.id}
              variants={{
                hidden: { opacity: 0, y: 22, filter: "blur(10px)" },
                show: {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: { duration: 0.72, ease: EASE },
                },
              }}
              className="min-h-0"
            >
              <OrderCategoryCard
                category={category}
                index={index}
                hoveredIndex={hoveredIndex}
                onHoverChange={setHoveredIndex}
                reducedMotion={!!reduced}
                isCoarsePointer={coarse}
              />
            </motion.div>
          ))}
        </div>
      </motion.main>
    </div>
  );
}
