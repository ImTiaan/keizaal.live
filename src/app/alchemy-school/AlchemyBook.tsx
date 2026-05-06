"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AlchemyBookPage } from "@/lib/alchemyBookPages";
import { ChevronLeft, ChevronRight } from "lucide-react";

type TurnDirection = "next" | "prev" | null;

export default function AlchemyBook({ pages }: { pages: AlchemyBookPage[] }) {
  const safePages = useMemo(() => (Array.isArray(pages) ? pages : []), [pages]);
  const [index, setIndex] = useState(0);
  const [turning, setTurning] = useState(false);
  const [direction, setDirection] = useState<TurnDirection>(null);
  const [pending, setPending] = useState<number | null>(null);

  const current = safePages[index] || null;
  const nextIndex = pending ?? index;
  const next = safePages[nextIndex] || null;

  const canPrev = index > 0 && !turning;
  const canNext = index < safePages.length - 1 && !turning;

  const go = useCallback(
    (dir: Exclude<TurnDirection, null>) => {
      if (turning) return;
      const target = dir === "next" ? index + 1 : index - 1;
      if (target < 0 || target >= safePages.length) return;
      setDirection(dir);
      setPending(target);
      setTurning(true);
    },
    [index, safePages.length, turning]
  );

  useEffect(() => {
    if (!turning) return;
    const id = window.setTimeout(() => {
      if (pending !== null) setIndex(pending);
      setPending(null);
      setTurning(false);
      setDirection(null);
    }, 520);
    return () => window.clearTimeout(id);
  }, [pending, turning]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (canPrev) go("prev");
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (canNext) go("next");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canNext, canPrev, go]);

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full max-w-5xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-xs text-zinc-400 tracking-wider uppercase">Alchemy School Compendium</div>
            <div className="text-xl sm:text-2xl font-bold text-zinc-100 font-[family-name:var(--font-cinzel)] truncate">
              {current?.title || "Untitled"}
            </div>
          </div>
          <div className="text-xs text-zinc-500 tabular-nums">
            {safePages.length > 0 ? `${index + 1} / ${safePages.length}` : "0 / 0"}
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute -inset-4 rounded-[28px] bg-black/30 blur-2xl" />
          <div className="relative rounded-[24px] border border-zinc-800/60 bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(246,231,190,0.08),rgba(0,0,0,0))] p-4 sm:p-6">
            <div className="rounded-[18px] bg-[linear-gradient(135deg,rgba(251,244,216,0.95),rgba(236,223,182,0.9))] text-zinc-900 shadow-2xl">
              <div className="relative overflow-hidden rounded-[18px]">
                <div className="alchemy-book-page relative min-h-[520px] sm:min-h-[620px] px-5 py-6 sm:px-10 sm:py-10 [perspective:1600px]">
                  <div
                    className={`alchemy-book-sheet ${turning ? "is-turning" : ""} ${
                      direction === "next" ? "turn-next" : direction === "prev" ? "turn-prev" : ""
                    }`}
                  >
                    <div className="alchemy-book-face alchemy-book-front">
                      <div
                        className="alchemy-book-content"
                        dangerouslySetInnerHTML={{ __html: current?.html || "" }}
                      />
                    </div>
                    <div className="alchemy-book-face alchemy-book-back">
                      <div
                        className="alchemy-book-content"
                        dangerouslySetInnerHTML={{ __html: next?.html || "" }}
                      />
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_500px_at_50%_20%,rgba(0,0,0,0),rgba(0,0,0,0.08))]" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!canPrev}
                onClick={() => go("prev")}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!canNext}
                onClick={() => go("next")}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
