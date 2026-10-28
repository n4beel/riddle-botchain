import Panel from "@/components/ui/Panel";

export default function LimitationBlock() {
  return (
    <Panel deckle className="my-6">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-[#8A5A00]/15 text-[#8A5A00] flex items-center justify-center font-heading text-xs flex-shrink-0 mt-0.5">
          !
        </div>
        <div className="flex-1">
          <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
            What a riddle can't prove
          </h3>
          <ul className="mt-2 space-y-1.5 font-serif text-xs md:text-sm text-[var(--text-secondary)] list-disc pl-4">
            <li>
              The creator knows the answer and can play through other wallets.
            </li>
            <li>
              Once anyone shows the answer, it is public. Later solvers rank behind.
            </li>
            <li>
              Answers are matched as trimmed, lowercase text. Spelling counts.
            </li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}
