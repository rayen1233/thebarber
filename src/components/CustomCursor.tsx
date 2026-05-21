import { animate, motion, useMotionValue } from "framer-motion";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import logoMark from "../../logo.png";

const CURSOR_HTML_CLASS = "use-custom-cursor";

const INTERACTIVE_SELECTOR =
  'a[href], button, [role="button"], input[type="submit"], input[type="button"], label[for], select, textarea, summary, [data-cursor-hover]';

function useFinePointer() {
  const [fine, setFine] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(pointer: fine)").matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const sync = () => setFine(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return fine;
}

function isInteractiveTarget(el: Element | null): boolean {
  if (!el || !(el instanceof Element)) return false;
  if (el.closest("[data-split-panel]")) return true;
  return Boolean(el.closest(INTERACTIVE_SELECTOR));
}

type CustomCursorProps = {
  active?: boolean;
};

/**
 * Luxury minimal cursor: precise gold dot + delayed thin ring; optional tiny mark inside ring.
 */
export function CustomCursor({ active = true }: CustomCursorProps) {
  const finePointer = useFinePointer();
  const enabled = finePointer && active;

  const moved = useRef(false);
  const rafRef = useRef(0);

  const dotX = useMotionValue(-100);
  const dotY = useMotionValue(-100);
  const ringX = useMotionValue(-100);
  const ringY = useMotionValue(-100);
  const ringClickScale = useMotionValue(1);

  const [interactive, setInteractive] = useState(false);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!enabled) return;
      if (e.pointerType === "touch") return;
      const cx = e.clientX;
      const cy = e.clientY;
      dotX.set(cx);
      dotY.set(cy);
      if (!moved.current) {
        moved.current = true;
        ringX.set(cx);
        ringY.set(cy);
      }
      const top = document.elementFromPoint(cx, cy);
      setInteractive(isInteractiveTarget(top));
    },
    [enabled, dotX, dotY, ringX, ringY],
  );

  const onPointerDown = useCallback(() => {
    if (!enabled) return;
    animate(ringClickScale, 0.85, {
      duration: 0.08,
      ease: [0.4, 0, 0.2, 1],
    }).then(() =>
      animate(ringClickScale, 1, {
        duration: 0.24,
        ease: [0.22, 1, 0.36, 1],
      }),
    );
  }, [enabled, ringClickScale]);

  const onPointerLeaveWindow = useCallback((e: MouseEvent) => {
    if (e.relatedTarget === null) setInteractive(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const html = document.documentElement;
    const body = document.body;
    const prevBodyCursor = body.style.cursor;

    html.classList.add(CURSOR_HTML_CLASS);
    body.style.cursor = "none";

    const loop = () => {
      const k = 0.1;
      const tx = dotX.get();
      const ty = dotY.get();
      ringX.set(ringX.get() + (tx - ringX.get()) * k);
      ringY.set(ringY.get() + (ty - ringY.get()) * k);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.documentElement.addEventListener(
      "mouseout",
      onPointerLeaveWindow,
    );

    return () => {
      html.classList.remove(CURSOR_HTML_CLASS);
      body.style.cursor = prevBodyCursor;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.documentElement.removeEventListener(
        "mouseout",
        onPointerLeaveWindow,
      );
    };
  }, [enabled, onPointerDown, onPointerLeaveWindow, onPointerMove, ringX, ringY, dotX, dotY]);

  if (!enabled) return null;

  const cursor = (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[120000]"
        style={{
          x: ringX,
          y: ringY,
          translateX: "-50%",
          translateY: "-50%",
        }}
      >
        <motion.div
          className="flex origin-center items-center justify-center"
          style={{ scale: ringClickScale }}
        >
          <motion.div
            className="flex origin-center items-center justify-center rounded-full border border-solid bg-transparent"
            initial={false}
            animate={{
              width: interactive ? 52 : 34,
              height: interactive ? 52 : 34,
              opacity: interactive ? 1 : 0.45,
              borderColor: interactive
                ? "rgba(232, 215, 170, 0.88)"
                : "rgba(185, 160, 95, 0.5)",
              boxShadow: interactive
                ? "0 0 18px rgba(210, 180, 100, 0.2)"
                : "0 0 0 rgba(0,0,0,0)",
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 32,
              mass: 0.32,
            }}
          >
            {!interactive && (
              <img
                src={logoMark}
                alt=""
                width={14}
                height={14}
                draggable={false}
                className="pointer-events-none select-none object-contain opacity-[0.35]"
                style={{
                  width: 14,
                  height: 14,
                  filter:
                    "brightness(1.05) contrast(1.05) saturate(0.95)",
                }}
              />
            )}
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[120001]"
        style={{
          x: dotX,
          y: dotY,
          translateX: "-50%",
          translateY: "-50%",
        }}
      >
        <div
          className="rounded-full bg-gold-light shadow-[0_0_5px_rgba(210,185,110,0.4)] ring-[0.5px] ring-gold/30"
          style={{ width: 5, height: 5 }}
        />
      </motion.div>
    </>
  );

  return createPortal(cursor, document.body);
}
