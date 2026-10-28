import { HTMLAttributes, ReactNode } from "react";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  deckle?: boolean;
  padded?: boolean;
  children?: ReactNode;
}

export default function Panel({
  elevated = false,
  deckle = false,
  padded = true,
  children,
  className = "",
  style,
  ...rest
}: PanelProps) {
  return (
    <div
      className={[
        "relative rounded-[4px] transition-colors",
        deckle
          ? "border-2 border-[var(--border-default)] shadow-[inset_0_0_16px_rgba(216,199,155,0.3)]"
          : "border border-[var(--border-subtle)] shadow-[0_2px_8px_rgba(45,30,18,0.06)]",
        padded ? "p-5 md:p-6" : "",
        className,
      ].join(" ")}
      style={{
        background: elevated ? "var(--bg-elevated)" : "var(--bg-surface)",
        ...style,
      }}
      {...rest}
    >
      {deckle && (
        <span
          className="absolute -top-[5px] -left-[5px] w-2.5 h-2.5 border-t-2 border-l-2 border-[var(--accent)] opacity-60"
          aria-hidden="true"
        />
      )}
      {deckle && (
        <span
          className="absolute -bottom-[5px] -right-[5px] w-2.5 h-2.5 border-b-2 border-r-2 border-[var(--accent)] opacity-60"
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
}
