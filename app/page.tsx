"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/layout/PageShell";
import ScrollShelf from "@/components/scroll/ScrollShelf";
import LimitationBlock from "@/components/scroll/LimitationBlock";
import { useRiddle } from "@/lib/useRiddle";
import type { Puzzle } from "@/lib/riddle";

export default function HomePage() {
  const { fetchLatest, deployed } = useRiddle();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const items = await fetchLatest(0n, 50n);
        if (!cancelled) {
          setPuzzles(items);
        }
      } catch (err) {
        console.error("Failed to load shelf:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchLatest]);

  return (
    <PageShell
      title="The Riddle Shelf"
      subtitle="Inscribed puzzles from across the realm. Prove knowledge to claim ranked prizes."
    >
      <div className="space-y-8">
        <ScrollShelf puzzles={puzzles} loading={loading} />
        <LimitationBlock />
      </div>
    </PageShell>
  );
}
