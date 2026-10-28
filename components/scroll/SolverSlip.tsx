"use client";

import { useState, useEffect } from "react";
import { useAccount, useBlockNumber } from "wagmi";
import Button from "@/components/ui/Button";
import {
  answerHash,
  commitmentFor,
  generateSalt,
  guessStore,
  normalize,
  type Puzzle,
  type SolverPhase,
  determinePhase,
} from "@/lib/riddle";

interface SolverSlipProps {
  puzzle: Puzzle;
  userCommitment?: `0x${string}`;
  userCommitBlock?: bigint;
  userHasWon?: boolean;
  onCommit: (commitment: `0x${string}`, answer: string, salt: `0x${string}`) => Promise<void>;
  onReveal: (answer: string, salt: `0x${string}`) => Promise<void>;
  committing?: boolean;
  revealing?: boolean;
}

export default function SolverSlip({
  puzzle,
  userCommitment,
  userCommitBlock,
  userHasWon,
  onCommit,
  onReveal,
  committing = false,
  revealing = false,
}: SolverSlipProps) {
  const { address, isConnected } = useAccount();
  const { data: currentBlock } = useBlockNumber({ watch: true });

  const [inputAnswer, setInputAnswer] = useState("");
  const [manualSalt, setManualSalt] = useState<`0x${string}` | "">("");
  const [manualMode, setManualMode] = useState(false);
  const [localSalt, setLocalSalt] = useState<`0x${string}` | null>(null);

  // Initialize salt or load from store
  useEffect(() => {
    if (!address) return;
    const stored = guessStore.get(puzzle.id, address);
    if (stored) {
      setInputAnswer(stored.answer);
      setLocalSalt(stored.salt);
      setManualSalt(stored.salt);
    } else if (!localSalt) {
      setLocalSalt(generateSalt());
    }
  }, [address, puzzle.id]);

  const phase: SolverPhase = determinePhase({
    puzzle,
    userAddress: address,
    userCommitment,
    userCommitBlock,
    userHasWon,
    currentBlock,
  });

  const isCreator =
    address && puzzle.creator.toLowerCase() === address.toLowerCase();

  const activeSalt = manualSalt || localSalt || generateSalt();
  const normalizedAnswer = normalize(inputAnswer);
  const hashPreview = inputAnswer ? answerHash(inputAnswer) : "—";

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputAnswer.trim() || !address) return;

    const salt = activeSalt;
    const comm = commitmentFor(puzzle.id, address, inputAnswer, salt);

    // Save to local storage before sending
    guessStore.save({
      puzzleId: puzzle.id.toString(),
      solver: address,
      answer: inputAnswer,
      salt: salt,
      commitment: comm,
      timestamp: Date.now(),
    });

    await onCommit(comm, inputAnswer, salt);
  }

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    if (!inputAnswer.trim() || !activeSalt) return;
    await onReveal(inputAnswer, activeSalt);
  }

  return (
    <div className="w-full lg:w-80 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] rounded-[4px] p-5 shadow-[0_4px_16px_rgba(45,30,18,0.08)] flex flex-col justify-between">
      <div>
        {/* Slip Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] mb-4">
          <span className="font-heading text-xs font-bold uppercase tracking-widest text-[var(--accent)]">
            Solver's Slip
          </span>
          <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase">
            Anti-Front-Run
          </span>
        </div>

        {/* Phase / State Rendering */}
        {!isConnected ? (
          <div className="text-center py-6">
            <p className="font-serif text-sm text-[var(--text-secondary)] mb-3">
              Connect your wallet to seal your guess and claim prizes.
            </p>
          </div>
        ) : isCreator ? (
          <div className="p-3 bg-[#EDE0BE] rounded text-center text-xs font-serif text-[var(--text-secondary)]">
            You inscribed this riddle. Creators cannot solve their own puzzles.
          </div>
        ) : phase === "won" ? (
          <div className="p-4 bg-[#E2F0D9] border border-[#1F7A3D]/40 rounded text-center">
            <h5 className="font-heading text-sm font-bold text-[#1F7A3D]">
              Victory Recorded!
            </h5>
            <p className="font-serif text-xs text-[var(--text-secondary)] mt-1">
              Your answer was verified on-chain and your prize has been credited to
              your till.
            </p>
          </div>
        ) : phase === "all_solved" ? (
          <div className="p-3 bg-[var(--bg-elevated)] rounded text-center text-xs font-serif text-[var(--text-muted)]">
            All three prize slots have been claimed by earlier solvers.
          </div>
        ) : phase === "reclaimed" ? (
          <div className="p-3 bg-[var(--bg-elevated)] rounded text-center text-xs font-serif text-[var(--text-muted)]">
            This riddle has been reclaimed by its creator.
          </div>
        ) : phase === "expired" ? (
          <div className="p-3 bg-[#FDE8E8] rounded text-center text-xs font-serif text-[var(--danger)]">
            The deadline has passed for this riddle.
          </div>
        ) : phase === "sealed_waiting" ? (
          <div className="space-y-4">
            <div className="p-3 bg-[#EDE0BE] border border-[var(--border-default)] rounded text-xs space-y-2">
              <div className="font-heading font-bold text-[var(--text-primary)] uppercase flex items-center justify-between">
                <span>Step 2 of 3</span>
                <span className="text-[10px] text-[var(--accent)]">
                  Wait One Block
                </span>
              </div>
              <p className="font-serif text-[var(--text-secondary)]">
                Your guess is sealed in block #{userCommitBlock?.toString()}. You
                must wait for the next block before revealing to prevent front-running bots.
              </p>
              <div className="flex items-center justify-between font-mono text-[11px] pt-1 border-t border-[var(--border-subtle)]">
                <span>Current block:</span>
                <span className="font-bold text-[var(--accent)]">
                  #{currentBlock?.toString() ?? "..."}
                </span>
              </div>
            </div>

            <div className="text-center py-2">
              <span className="inline-block w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-1" />
              <p className="text-[11px] font-mono text-[var(--text-muted)]">
                Mining next block...
              </p>
            </div>
          </div>
        ) : phase === "ready_to_reveal" ? (
          <form onSubmit={handleReveal} className="space-y-4">
            <div className="p-3 bg-[#E2F0D9] border border-[#1F7A3D]/40 rounded text-xs">
              <div className="font-heading font-bold text-[#1F7A3D] uppercase">
                Step 3 of 3: Show your answer
              </div>
              <p className="font-serif text-[var(--text-secondary)] mt-1">
                The waiting block has mined! Reveal your answer now to secure your
                medal and prize payout.
              </p>
            </div>

            <div>
              <label className="block font-heading text-[11px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                Your Revealed Answer
              </label>
              <input
                type="text"
                value={inputAnswer}
                onChange={(e) => setInputAnswer(e.target.value)}
                placeholder="The secret answer..."
                className="w-full px-3 py-2 text-sm font-mono bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[2px] focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
                required
              />
            </div>

            {manualMode && (
              <div>
                <label className="block font-heading text-[11px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                  Salt (Secret 32-Byte Hex)
                </label>
                <input
                  type="text"
                  value={manualSalt}
                  onChange={(e) => setManualSalt(e.target.value as `0x${string}`)}
                  placeholder="0x..."
                  className="w-full px-3 py-2 text-xs font-mono bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[2px] focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
                  required
                />
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={revealing}
              className="w-full"
            >
              Show Your Answer
            </Button>

            <button
              type="button"
              onClick={() => setManualMode(!manualMode)}
              className="w-full text-center text-[11px] font-mono text-[var(--text-muted)] hover:underline cursor-pointer"
            >
              {manualMode ? "Hide Salt Field" : "Manually Adjust Salt"}
            </button>
          </form>
        ) : (
          /* Default: Step 1: Seal your guess */
          <form onSubmit={handleCommit} className="space-y-4">
            <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded text-xs">
              <div className="font-heading font-bold text-[var(--text-primary)] uppercase">
                Step 1 of 3: Seal your guess
              </div>
              <p className="font-serif text-[var(--text-secondary)] mt-1">
                Enter your guess below. It is cryptographically blinded with a random
                salt so miners cannot read or steal your answer from the mempool.
              </p>
            </div>

            <div>
              <label className="block font-heading text-[11px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                Your Guess
              </label>
              <input
                type="text"
                value={inputAnswer}
                onChange={(e) => setInputAnswer(e.target.value)}
                placeholder="Enter riddle answer..."
                className="w-full px-3 py-2 text-sm font-mono bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[2px] focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
                required
              />
              {inputAnswer && (
                <div className="mt-1 text-[10px] font-mono text-[var(--text-muted)] truncate">
                  Normalized: "{normalizedAnswer}"
                </div>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={committing}
              disabled={!inputAnswer.trim()}
              className="w-full"
            >
              Seal Your Guess
            </Button>
          </form>
        )}
      </div>

      {/* Slip Footer Tip */}
      <div className="mt-6 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-serif text-[var(--text-muted)] italic text-center">
        Parchment seals never reveal their secrets until the hour arrives.
      </div>
    </div>
  );
}
