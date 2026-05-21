import { useCallback, useState } from "react";
import { IntroLoader } from "./components/IntroLoader";
import { CustomCursor } from "./components/CustomCursor";
import { FullScreenOrderHero } from "./components/FullScreenOrderHero";
import { CategoryTransition } from "./components/order/CategoryTransition";
import { OrderSplitPage } from "./components/order/OrderSplitPage";

function Home() {  return (
    <main id="commander" className="min-h-screen bg-neutral-950">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 pb-24 pt-28 sm:px-10 lg:px-16">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.35em] text-gold/80">
          Maison de coupe
        </p>
        <h1 className="max-w-3xl font-display text-4xl font-light leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
          Précision, silence,{" "}
          <span className="bg-gradient-to-r from-gold-light via-gold to-gold-dark bg-clip-text text-transparent">
            détail
          </span>
          .
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-neutral-400 sm:text-base">
          Un espace minimal pour une coupe exécutée avec la même exigence
          qu&apos;un atelier de luxe.
        </p>
        <div className="mt-12 flex flex-wrap gap-4">
          <a
            href="#reserver"
            className="inline-flex items-center justify-center border border-gold/50 bg-gold/10 px-8 py-3 text-sm font-medium uppercase tracking-widest text-gold-light transition hover:border-gold hover:bg-gold/15"
          >
            Réserver
          </a>
          <a
            href="#services"
            className="inline-flex items-center justify-center border border-white/10 px-8 py-3 text-sm font-medium uppercase tracking-widest text-neutral-300 transition hover:border-white/25"
          >
            Services
          </a>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [introDone, setIntroDone] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const handleIntroComplete = useCallback(() => setIntroDone(true), []);
  const openOrderShowroom = useCallback(() => setShowOrders(true), []);

  return (
    <>
      {introDone ? (
        <CategoryTransition
          showOrders={showOrders}
          hero={
            <>
              <FullScreenOrderHero
                tagline="Maison de coupe"
                onCtaClick={openOrderShowroom}
              />
              {!showOrders ? <Home /> : null}
            </>
          }
          orders={
            <OrderSplitPage onBackToHero={() => setShowOrders(false)} />
          }
        />
      ) : (
        <div className="min-h-[100dvh] bg-black" aria-hidden />
      )}
      <CustomCursor />
      {!introDone && <IntroLoader onComplete={handleIntroComplete} />}
    </>
  );
}