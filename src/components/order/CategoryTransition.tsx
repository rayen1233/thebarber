import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 0.08, 0.18, 1] as const;

export type CategoryTransitionProps = {
  showOrders: boolean;
  hero: ReactNode;
  orders: ReactNode;
};

/**
 * Cinematic handoff: hero dissolves, then the showroom page resolves from blur.
 */
export function CategoryTransition({
  showOrders,
  hero,
  orders,
}: CategoryTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      {!showOrders ? (
        <motion.div
          key="hero-stack"
          className="relative flex min-h-[100dvh] shrink-0 flex-col"
          initial={false}
          exit={{
            opacity: 0,
            filter: "blur(14px)",
          }}
          transition={{ duration: 0.72, ease: EASE }}
        >
          {hero}
        </motion.div>
      ) : (
        <motion.div
          key="order-showroom"
          className="relative min-h-[100dvh] w-full bg-black"
          initial={{ opacity: 0, filter: "blur(18px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(12px)" }}
          transition={{ duration: 1.05, delay: 0.14, ease: EASE }}
        >
          {orders}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
