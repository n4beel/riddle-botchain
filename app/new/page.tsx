"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import LimitationBlock from "@/components/scroll/LimitationBlock";
import { useRiddle } from "@/lib/useRiddle";
import { answerHash, normalize } from "@/lib/riddle";
import { MAX_QUESTION, MIN_DURATION, MAX_DURATION } from "@/lib/limits";

const DURATIONS = [
  { label: "1 Hour", secs: 3600n },
  { label: "1 Day", secs: 86400n },
  { label: "7 Days", secs: 86400n * 7n },
  { label: "14 Days", secs: 86400n * 14n },
  { label: "30 Days", secs: 86400n * 30n },
  { label: "90 Days", secs: 86400n * 90n },
];

export default function NewRiddlePage() {
  const router = useRouter();
  const { createRiddle, isTransacting } = useRiddle();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [poolAmount, setPoolAmount] = useState("1.0");
  const [durationSecs, setDurationSecs] = useState<bigint>(86400n * 7n);
  const [backupDownloaded, setBackupDownloaded] = useState(false);

  const normalizedAns = normalize(answer);
  const computedHash = answer.trim() ? answerHash(answer) : null;
  const questionByteLength = new TextEncoder().encode(question).length;
  const isQuestionValid = questionByteLength > 0 && questionByteLength <= MAX_QUESTION;

  function handleDownloadBackup() {
    if (!question.trim() || !answer.trim()) return;

    const backupData = {
      project: "Riddle Protocol",
      inscribedAt: new Date().toISOString(),
      question,
      answer,
      normalizedAnswer: normalizedAns,
      answerHash: computedHash,
      poolAmountBOT: poolAmount,
      durationSeconds: durationSecs.toString(),
      notice:
        "Keep this file secure. The answer was never sent to the network. If you forget it, no one can recover it.",
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riddle-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupDownloaded(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isQuestionValid || !computedHash) return;

    let poolWei: bigint;
    try {
      poolWei = parseEther(poolAmount);
      if (poolWei <= 0n) throw new Error("Pool must be > 0");
    } catch {
      alert("Please enter a valid BOT amount greater than zero.");
      return;
    }

    const createdId = await createRiddle(
      question,
      computedHash,
      durationSecs,
      poolWei
    );

    if (createdId) {
      router.push(`/riddle/${createdId}`);
    }
  }

  return (
    <PageShell
      title="Inscribe a New Riddle"
      subtitle="Craft a riddle, fund the prize pool, and challenge the realm's solvers."
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <Panel deckle>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Question Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  The Riddle Question
                </label>
                <span
                  className={`text-[11px] font-mono ${
                    questionByteLength > MAX_QUESTION
                      ? "text-[var(--danger)] font-bold"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {questionByteLength} / {MAX_QUESTION} bytes
                </span>
              </div>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What has roots that nobody sees, and is taller than trees?..."
                rows={3}
                className="w-full px-3 py-2 text-base font-serif italic bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[2px] focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] resize-none"
                required
              />
            </div>

            {/* Answer Field (Strictly Client-Side) */}
            <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[3px] space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Secret Answer (Never Sent to Network)
                </label>
                <span className="text-[10px] font-mono text-[var(--accent)] uppercase font-semibold">
                  Zero Knowledge on Wire
                </span>
              </div>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="mountain"
                className="w-full px-3 py-2 text-sm font-mono bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[2px] focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
                required
              />
              <p className="font-serif text-xs text-[var(--text-secondary)]">
                The plaintext answer is never sent in transactions or stored on-chain.
                Only the cryptographic hash below is inscribed into the smart contract.
              </p>

              {answer.trim() && (
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1 font-mono text-xs">
                  <div className="text-[var(--text-muted)]">
                    Normalized:{" "}
                    <span className="text-[var(--text-primary)]">
                      "{normalizedAns}"
                    </span>
                  </div>
                  <div className="truncate text-[var(--text-muted)]">
                    Answer Hash:{" "}
                    <span className="text-[var(--accent)] font-semibold">
                      {computedHash}
                    </span>
                  </div>
                </div>
              )}

              {/* Download Backup Button */}
              {answer.trim() && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="parchment"
                    size="sm"
                    onClick={handleDownloadBackup}
                    className="w-full"
                  >
                    {backupDownloaded
                      ? "✓ Answer Backup Downloaded"
                      : "📥 Download Secret Answer Backup"}
                  </Button>
                </div>
              )}
            </div>

            {/* Prize Pool & Duration Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-1">
                  Prize Pool (BOT)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  value={poolAmount}
                  onChange={(e) => setPoolAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[2px] focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
                  required
                />
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                  Split 50% (1st) / 30% (2nd) / 20% (3rd)
                </span>
              </div>

              <div>
                <label className="block font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-1">
                  Duration
                </label>
                <select
                  value={durationSecs.toString()}
                  onChange={(e) => setDurationSecs(BigInt(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[2px] focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] cursor-pointer"
                >
                  {DURATIONS.map((d) => (
                    <option key={d.secs.toString()} value={d.secs.toString()}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                  Unspent pool reclaimable after deadline
                </span>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-4 border-t border-[var(--border-default)]">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isTransacting}
                disabled={!isQuestionValid || !computedHash}
                className="w-full"
              >
                Inscribe Riddle & Deposit {poolAmount || "0"} BOT
              </Button>
            </div>
          </form>
        </Panel>

        <LimitationBlock />
      </div>
    </PageShell>
  );
}
