"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export function TabDropdown({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = links.find((l) => l.href === pathname) ?? links[0];

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative self-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-[34px] items-center gap-2 border border-accent bg-void px-3 text-[11px] font-medium uppercase tracking-wider text-ink transition-colors duration-300 hover:bg-accent-dim active:scale-[0.98]"
      >
        {current.label}
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="animate-reveal absolute right-0 top-[calc(100%+6px)] z-10 min-w-full border border-line bg-panel py-1"
        >
          {links.map((link) => {
            const active = link.href === pathname;
            return (
              <li key={link.href} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!active) router.push(link.href);
                  }}
                  className={`block w-full whitespace-nowrap px-4 py-2 text-left text-[11px] uppercase tracking-wider transition-colors duration-300 ${
                    active ? "text-accent" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  {link.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
