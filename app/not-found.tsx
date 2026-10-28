import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import Button from "@/components/ui/Button";

export default function NotFound() {
  return (
    <PageShell>
      <div className="py-24 text-center max-w-md mx-auto">
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--bg-elevated)] border-2 border-[var(--border-default)] flex items-center justify-center font-heading text-2xl text-[var(--accent)] mb-4">
          §
        </div>
        <h2 className="font-heading text-2xl font-bold text-[var(--text-primary)] tracking-wide">
          Lost to Time
        </h2>
        <p className="font-serif italic text-base text-[var(--text-secondary)] mt-2 mb-6">
          "No scroll lies at this location. Perhaps it was solved and returned to dust,
          or never inscribed at all."
        </p>
        <Link href="/">
          <Button variant="parchment" size="md">
            Return to Scroll Shelf
          </Button>
        </Link>
      </div>
    </PageShell>
  );
}
