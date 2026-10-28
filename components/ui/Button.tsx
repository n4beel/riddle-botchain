"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "parchment" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-ink)] border-2 border-[#15543F] shadow-[0_2px_4px_rgba(31,122,92,0.25)] hover:brightness-105 active:translate-y-[1px]",
  parchment:
    "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)] shadow-[0_1px_3px_rgba(45,30,18,0.08)] hover:bg-[#F5E8C7] active:translate-y-[1px]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]",
  danger:
    "bg-transparent text-[var(--danger)] border border-[var(--danger)] hover:bg-[#FDE8E8] active:translate-y-[1px]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-[11px] tracking-[0.05em]",
  md: "px-5 py-2 text-[13px] tracking-[0.04em]",
  lg: "px-7 py-3 text-[14px] tracking-[0.05em]",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      children,
      className = "",
      style,
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2",
          "font-heading font-semibold uppercase rounded-[3px] select-none",
          "transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        style={style}
        {...rest}
      >
        {loading ? (
          <>
            <span
              className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
