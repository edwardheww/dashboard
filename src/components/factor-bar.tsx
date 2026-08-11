import type { Factor } from "@/lib/types";

export function FactorBar({ factor }: { factor: Factor }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] uppercase tracking-wider text-ink-faint">
          {factor.label}
        </span>
        <span className="font-mono text-xs tabular-nums text-ink-dim">
          {factor.score}
        </span>
      </div>
      <div className="h-[3px] w-full bg-line">
        <div
          className="h-full bg-ink-dim"
          style={{ width: `${factor.score}%` }}
        />
      </div>
    </div>
  );
}
