"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useAccount, useBlockNumber } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import ParchmentScroll from "@/components/scroll/ParchmentScroll";
import SolverSlip from "@/components/scroll/SolverSlip";
import LimitationBlock from "@/components/scroll/LimitationBlock";
import { useRiddle } from "@/lib/useRiddle";
import type { Puzzle } from "@/lib/riddle";

export default function RiddleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const puzzleId = BigInt(resolvedParams.id);

  const { address } = useAccount();
  const { data: currentBlock } = useBlockNumber({ watch: true });
  const {
    fetchPuzzle,
    fetchCommitment,
    commitSolve,
    reveal,
    reclaim,
    isTransacting,
  } = useRiddle();

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [winners, setWinners] = useState<
    readonly [`0x${string}`, `0x${string}`, `0x${string}`]
  >([
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
  ]);
  const [userCommitment, setUserCommitment] = useState<`0x${string}`>();
  const [userCommitBlock, setUserCommitBlock] = useState<bigint>();
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchPuzzle(puzzleId);
      if (data.puzzle) {
        setPuzzle(data.puzzle);
        setWinners(data.winners);
      }
      if (address) {
        const commData = await fetchCommitment(puzzleId, address);
        setUserCommitment(commData.commitment);
        setUserCommitBlock(commData.blockNumber);
      }
    } catch (err) {
      console.error("Failed to load riddle detail:", err);
    } finally {
      setLoading(false);
    }
  }, [puzzleId, address, fetchPuzzle, fetchCommitment]);

  useEffect(() => {
    loadData();
  }, [loadData, currentBlock]);

  const isCreator =
    address && puzzle
      ? puzzle.creator.toLowerCase() === address.toLowerCase()
      : false;

  const userHasWon =
    address && puzzle
      ? winners.some((w) => w.toLowerCase() === address.toLowerCase())
      : false;

  async function handleCommit(
    commitment: `0x${string}`,
    _answer: string,
    _salt: `0x${string}`
  ) {
    const ok = await commitSolve(puzzleId, commitment);
    if (ok) {
      await loadData();
    }
  }

  async function handleReveal(answer: string, salt: `0x${string}`) {
    const ok = await reveal(puzzleId, answer, salt);
    if (ok) {
      await loadData();
    }
  }

  async function handleReclaim() {
    const ok = await reclaim(puzzleId);
    if (ok) {
      await loadData();
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="py-20 text-center">
          <div className="w-8 h-8 mx-auto border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="font-heading text-sm text-[var(--text-muted)] tracking-wider">
            Unrolling the parchment scroll...
          </p>
        </div>
      </PageShell>
    );
  }

  if (!puzzle) {
    return (
      <PageShell title="Scroll Not Found">
        <div className="py-16 text-center">
          <p className="font-serif text-base text-[var(--text-secondary)]">
            No riddle exists under Scroll #{resolvedParams.id}.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-col lg:flex-row items-start justify-center gap-8 max-w-5xl mx-auto">
        {/* Main Central Scroll */}
        <div className="flex-1 w-full max-w-2xl">
          <ParchmentScroll
            puzzle={puzzle}
            winners={winners}
            isCreator={isCreator}
            onReclaim={handleReclaim}
            reclaimLoading={isTransacting}
          />
          <LimitationBlock />
        </div>

        {/* Solver Slip (Right Drawer on Desktop, Below on Mobile) */}
        <aside className="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-24">
          <SolverSlip
            puzzle={puzzle}
            userCommitment={userCommitment}
            userCommitBlock={userCommitBlock}
            userHasWon={userHasWon}
            onCommit={handleCommit}
            onReveal={handleReveal}
            committing={isTransacting}
            revealing={isTransacting}
          />
        </aside>
      </div>
    </PageShell>
  );
}
