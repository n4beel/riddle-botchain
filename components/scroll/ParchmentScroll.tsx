import { formatEther } from "viem";
import Button from "@/components/ui/Button";
import { payouts, type Puzzle } from "@/lib/riddle";

interface ParchmentScrollProps {
  puzzle: Puzzle;
  winners: readonly [`0x${string}`, `0x${string}`, `0x${string}`];
  isCreator?: boolean;
  onReclaim?: () => void;
  reclaimLoading?: boolean;
  currentTime?: bigint;
}

const MEDAL_STYLES = [
  {
    rank: "1st Prize",
    pct: "50%",
    bg: "bg-[#F3E5AB] border-[#C5A059]",
    badge: "bg-[#C5A059] text-white",
    label: "Gold Leaf",
  },
  {
    rank: "2nd Prize",
    pct: "30%",
    bg: "bg-[#E6E8EA] border-[#9EABB2]",
    badge: "bg-[#9EABB2] text-white",
    label: "Silver Leaf",
  },
  {
    rank: "3rd Prize",
    pct: "20%",
    bg: "bg-[#EAD8C7] border-[#A87B51]",
    badge: "bg-[#A87B51] text-white",
    label: "Bronze Leaf",
  },
];

export default function ParchmentScroll({
  puzzle,
  winners,
  isCreator,
  onReclaim,
  reclaimLoading,
  currentTime,
}: ParchmentScrollProps) {
  const [p1, p2, p3] = payouts(puzzle.pool);
  const prizePools = [p1, p2, p3];

  const now = currentTime ? Number(currentTime) : Math.floor(Date.now() / 1000);
  const isExpired = now >= Number(puzzle.deadline);
  const isReclaimable =
    !puzzle.reclaimed && (isExpired || puzzle.solved >= 3);

  // Time label
  let timeLabel = "";
  if (!isExpired) {
    const diff = Number(puzzle.deadline) - now;
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    timeLabel = days > 0 ? `${days}d ${hours}h left` : `${hours}h ${mins}m left`;
  } else {
    timeLabel = "Expired";
  }

  return (
    <div className="relative max-w-2xl mx-auto my-4">
      {/* Top Scroll Rod */}
      <div className="scroll-rod mb-[-12px] z-10 mx-2" />

      {/* Main Parchment Body */}
      <div className="parchment-scroll px-6 py-10 sm:px-12 sm:py-14 rounded-[2px]">
        {/* Wax Green Seal Top Right */}
        <div className="flex flex-col items-center sm:items-end mb-6">
          <div className="wax-seal">
            <span className="text-xs font-bold leading-tight text-center">
              {Number(formatEther(puzzle.pool)).toFixed(1)}
              <br />
              <span className="text-[9px] uppercase tracking-wider">BOT</span>
            </span>
          </div>
          <span className="font-mono text-[11px] text-[var(--text-secondary)] mt-1.5 font-bold">
            {timeLabel}
          </span>
        </div>

        {/* Scroll Header Number */}
        <div className="text-center mb-6">
          <span className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            — Riddle #{puzzle.id.toString()} —
          </span>
        </div>

        {/* The Riddle Text */}
        <div className="my-8 text-center px-2 sm:px-6">
          <blockquote className="font-serif italic text-xl sm:text-2xl md:text-3xl leading-relaxed text-[var(--text-primary)]">
            "{puzzle.question}"
          </blockquote>
        </div>

        {/* Provenance and Answer Hash */}
        <div className="text-center my-6 py-3 border-y border-[var(--border-subtle)] font-mono text-xs text-[var(--text-muted)] space-y-1">
          <div>
            <span className="font-heading uppercase text-[10px] text-[var(--text-secondary)]">
              Inscribed by:
            </span>{" "}
            {puzzle.creator}
          </div>
          <div className="truncate">
            <span className="font-heading uppercase text-[10px] text-[var(--text-secondary)]">
              Answer Hash:
            </span>{" "}
            {puzzle.answerHash}
          </div>
        </div>

        {/* Three Medal Slots (1st / 2nd / 3rd) */}
        <div className="mt-8 space-y-3">
          <h4 className="font-heading text-xs uppercase font-bold tracking-widest text-[var(--text-secondary)] text-center mb-4">
            The Three Solver Medals
          </h4>

          <div className="grid grid-cols-1 gap-2.5">
            {MEDAL_STYLES.map((medal, idx) => {
              const winner = winners[idx];
              const hasWinner =
                winner &&
                winner !== "0x0000000000000000000000000000000000000000";
              const prize = prizePools[idx];

              return (
                <div
                  key={medal.rank}
                  className={`flex items-center justify-between p-3 rounded-[3px] border ${medal.bg} shadow-sm transition-all`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-heading text-[11px] font-bold px-2 py-0.5 rounded-[2px] ${medal.badge}`}
                    >
                      {medal.rank}
                    </span>
                    <span className="font-heading text-xs font-bold text-[var(--text-primary)]">
                      {medal.pct} ({formatEther(prize)} BOT)
                    </span>
                  </div>

                  <div className="font-mono text-xs truncate max-w-[180px] sm:max-w-xs text-right">
                    {hasWinner ? (
                      <span className="text-[var(--accent)] font-semibold">
                        {winner}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)] italic">
                        Unclaimed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Creator Reclaim Action */}
        {isCreator && isReclaimable && (
          <div className="mt-8 p-4 rounded-[4px] border border-[var(--border-default)] bg-[#EDE0BE] text-center">
            <h5 className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Creator Settlement Available
            </h5>
            <p className="font-serif text-xs text-[var(--text-secondary)] mt-1 mb-3">
              {isExpired
                ? "This riddle's deadline has passed. You may reclaim the unspent prize funds."
                : "All three solver prizes have been awarded. You may settle and reclaim the rounding dust."}
            </p>
            <Button
              variant="parchment"
              size="sm"
              loading={reclaimLoading}
              onClick={onReclaim}
            >
              Reclaim Remaining Funds
            </Button>
          </div>
        )}

        {puzzle.reclaimed && (
          <div className="mt-6 text-center">
            <span className="font-heading text-xs uppercase tracking-wider px-3 py-1 rounded bg-[#65513D] text-[#FBF3DC]">
              Riddle Reclaimed by Creator
            </span>
          </div>
        )}
      </div>

      {/* Bottom Scroll Rod */}
      <div className="scroll-rod mt-[-12px] z-10 mx-2" />
    </div>
  );
}
