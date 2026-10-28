"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAccount, useBlockNumber } from "wagmi";
import { formatEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { useRiddle } from "@/lib/useRiddle";
import { guessStore, type StoredGuess, type Puzzle } from "@/lib/riddle";

export default function MePage() {
  const { address, isConnected } = useAccount();
  const { data: currentBlock } = useBlockNumber({ watch: true });
  const {
    fetchPendingBalance,
    fetchLatest,
    withdraw,
    reclaim,
    isTransacting,
  } = useRiddle();

  const [pendingBalance, setPendingBalance] = useState<bigint>(0n); // honesty-ok: initial pending till balance
  const [myGuesses, setMyGuesses] = useState<StoredGuess[]>([]);
  const [myRiddles, setMyRiddles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async () => {
    if (!address) {
      setLoading(false);
      return;
    }

    try {
      const [bal, allPuzzles] = await Promise.all([
        fetchPendingBalance(address),
        fetchLatest(0n, 50n),
      ]);

      setPendingBalance(bal);

      const created = allPuzzles.filter(
        (p) => p.creator.toLowerCase() === address.toLowerCase()
      );
      setMyRiddles(created);

      const guesses = guessStore.listBySolver(address);
      setMyGuesses(guesses);
    } catch (err) {
      console.error("Failed to load user profile:", err);
    } finally {
      setLoading(false);
    }
  }, [address, fetchPendingBalance, fetchLatest]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData, currentBlock]);

  async function handleWithdraw() {
    const ok = await withdraw();
    if (ok) {
      await loadUserData();
    }
  }

  async function handleReclaim(id: bigint) {
    const ok = await reclaim(id);
    if (ok) {
      await loadUserData();
    }
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    <PageShell
      title="My Solves & Till"
      subtitle="Track your sealed guesses, collected winnings, and inscribed riddles."
    >
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Wallet Till Card */}
        <Panel deckle>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Unclaimed Till Balance
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-heading text-3xl sm:text-4xl font-bold text-[var(--accent)]">
                  {formatEther(pendingBalance)}
                </span>
                <span className="font-heading text-sm uppercase text-[var(--text-secondary)]">
                  BOT
                </span>
              </div>
              <p className="font-serif text-xs text-[var(--text-secondary)] mt-1">
                Winnings from solved riddles and reclaimed creator funds arrive here.
              </p>
            </div>

            <div>
              <Button
                variant="primary"
                size="md"
                onClick={handleWithdraw}
                disabled={pendingBalance <= 0n || !isConnected}
                loading={isTransacting}
              >
                Withdraw to Wallet
              </Button>
            </div>
          </div>
        </Panel>

        {/* Sealed Guesses Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-default)]">
            <h3 className="font-heading text-base font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Your Sealed Guesses ({myGuesses.length})
            </h3>
            <span className="text-xs font-serif text-[var(--text-muted)] italic">
              Stored locally on this device
            </span>
          </div>

          {myGuesses.length === 0 ? (
            <Panel className="text-center py-8">
              <p className="font-serif text-sm text-[var(--text-secondary)]">
                You have not sealed any guesses yet.
              </p>
              <div className="mt-3">
                <Link href="/">
                  <Button variant="parchment" size="sm">
                    Explore Riddle Shelf
                  </Button>
                </Link>
              </div>
            </Panel>
          ) : (
            <div className="space-y-3">
              {myGuesses.map((guess) => (
                <Panel
                  key={guess.puzzleId}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-heading text-xs font-bold text-[var(--text-primary)]">
                        Scroll #{guess.puzzleId}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        Answer: "{guess.answer}"
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[var(--text-muted)] truncate max-w-md">
                      Commitment: {guess.commitment}
                    </div>
                  </div>

                  <Link href={`/riddle/${guess.puzzleId}`}>
                    <Button variant="parchment" size="sm">
                      Open Scroll →
                    </Button>
                  </Link>
                </Panel>
              ))}
            </div>
          )}
        </section>

        {/* Inscribed Riddles Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-default)]">
            <h3 className="font-heading text-base font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Riddles You Inscribed ({myRiddles.length})
            </h3>
            <Link href="/new">
              <Button variant="parchment" size="sm">
                + Inscribe Another
              </Button>
            </Link>
          </div>

          {myRiddles.length === 0 ? (
            <Panel className="text-center py-8">
              <p className="font-serif text-sm text-[var(--text-secondary)]">
                You have not inscribed any riddles yet.
              </p>
              <div className="mt-3">
                <Link href="/new">
                  <Button variant="primary" size="sm">
                    Inscribe a Riddle
                  </Button>
                </Link>
              </div>
            </Panel>
          ) : (
            <div className="space-y-3">
              {myRiddles.map((riddle) => {
                const isExpired = now >= Number(riddle.deadline);
                const canReclaim =
                  !riddle.reclaimed && (isExpired || riddle.solved >= 3);

                return (
                  <Panel
                    key={riddle.id.toString()}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-heading text-xs font-bold text-[var(--text-primary)]">
                          Scroll #{riddle.id.toString()}
                        </span>
                        <span className="font-heading text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                          {riddle.solved}/3 Solved
                        </span>
                        {riddle.reclaimed && (
                          <span className="text-[10px] font-heading px-2 py-0.5 rounded bg-[#65513D] text-[#FBF3DC]">
                            Reclaimed
                          </span>
                        )}
                      </div>
                      <p className="font-serif italic text-xs text-[var(--text-secondary)] line-clamp-1">
                        "{riddle.question}"
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-heading text-xs font-bold text-[var(--accent)]">
                        {formatEther(riddle.pool)} BOT
                      </span>

                      {canReclaim && (
                        <Button
                          variant="parchment"
                          size="sm"
                          onClick={() => handleReclaim(riddle.id)}
                          loading={isTransacting}
                        >
                          Reclaim
                        </Button>
                      )}

                      <Link href={`/riddle/${riddle.id.toString()}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
