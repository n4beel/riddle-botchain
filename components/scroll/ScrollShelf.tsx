import Link from "next/link";
import Button from "@/components/ui/Button";
import RolledScrollCard from "./RolledScrollCard";
import type { Puzzle } from "@/lib/riddle";

interface ScrollShelfProps {
  puzzles: Puzzle[];
  loading?: boolean;
}

export default function ScrollShelf({ puzzles, loading }: ScrollShelfProps) {
  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-8 h-8 mx-auto border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="font-heading text-sm text-[var(--text-muted)] tracking-wider">
          Inspecting the library shelf...
        </p>
      </div>
    );
  }

  if (puzzles.length === 0) {
    return (
      <div className="py-16 px-4 text-center rounded-[4px] border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]">
        <div className="w-12 h-12 mx-auto rounded-full bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center font-heading text-xl text-[var(--text-muted)] mb-3">
          §
        </div>
        <h3 className="font-heading text-lg font-bold text-[var(--text-primary)]">
          The Shelf is Bare
        </h3>
        <p className="font-serif text-sm text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
          No riddles have been inscribed yet. Be the first creator to fund a prize
          pool and test the realm's wit.
        </p>
        <div className="mt-5">
          <Link href="/new">
            <Button size="md">Inscribe the First Riddle</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Shelf Header */}
      <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-strong)]">
        <div className="flex items-center gap-2">
          <span className="font-heading text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            Archived Scrolls ({puzzles.length})
          </span>
        </div>
        <Link href="/new">
          <Button size="sm" variant="parchment">
            + Inscribe Riddle
          </Button>
        </Link>
      </div>

      {/* Grid of Rolled Cylinders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-2">
        {puzzles.map((p) => (
          <RolledScrollCard key={p.id.toString()} puzzle={p} />
        ))}
      </div>
    </div>
  );
}
