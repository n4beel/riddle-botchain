import Link from "next/link";
import { formatEther } from "viem";
import type { Puzzle } from "@/lib/riddle";

interface RolledScrollCardProps {
  puzzle: Puzzle;
}

export default function RolledScrollCard({ puzzle }: RolledScrollCardProps) {
  const poolFormatted = formatEther(puzzle.pool);
  const now = Math.floor(Date.now() / 1000);
  const isExpired = now >= Number(puzzle.deadline);

  // Status tag
  let statusText = `${puzzle.solved}/3 Solved`;
  let statusColor = "bg-[var(--accent)] text-[var(--accent-ink)]";

  if (puzzle.reclaimed) {
    statusText = "Reclaimed";
    statusColor = "bg-[#65513D] text-[#FBF3DC]";
  } else if (puzzle.solved >= 3) {
    statusText = "All Solved";
    statusColor = "bg-[#1F7A3D] text-white";
  } else if (isExpired) {
    statusText = "Expired";
    statusColor = "bg-[#9E1F2B] text-white";
  }

  // Format time remaining
  let timeStr = "";
  if (!isExpired) {
    const diff = Number(puzzle.deadline) - now;
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    timeStr = days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  } else {
    timeStr = "Ended";
  }

  return (
    <Link
      href={`/riddle/${puzzle.id}`}
      className="group block text-decoration-none select-none focus:outline-none"
    >
      <div className="rolled-cylinder p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between min-h-[140px] border border-[var(--border-default)]">
        {/* Top Scroll Rim */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#A88F67] via-[#FBF3DC] to-[#A88F67] opacity-80" />

        {/* Content Row */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-heading text-xs font-bold text-[var(--text-muted)] tracking-wider">
              SCROLL #{puzzle.id.toString()}
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={`font-heading text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusColor}`}
              >
                {statusText}
              </span>
              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                {timeStr}
              </span>
            </div>
          </div>

          {/* Riddle Quote Preview */}
          <blockquote className="font-serif italic text-base sm:text-lg text-[var(--text-primary)] leading-snug line-clamp-2">
            "{puzzle.question}"
          </blockquote>
        </div>

        {/* Bottom Details Row */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--border-subtle)] text-xs">
          <div className="flex items-center gap-1.5 font-mono text-[var(--text-secondary)]">
            <span className="text-[10px] uppercase font-heading text-[var(--text-muted)]">
              By
            </span>
            <span>
              {puzzle.creator.slice(0, 6)}...{puzzle.creator.slice(-4)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-heading text-xs font-bold text-[var(--accent)]">
              {poolFormatted} BOT
            </span>
            <span className="font-heading text-xs text-[var(--text-muted)] group-hover:translate-x-0.5 transition-transform">
              Unroll →
            </span>
          </div>
        </div>

        {/* Bottom Scroll Rim */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#A88F67] via-[#FBF3DC] to-[#A88F67] opacity-80" />
      </div>
    </Link>
  );
}
