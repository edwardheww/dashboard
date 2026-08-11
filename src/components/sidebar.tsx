"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/", label: "Stocks", isActive: (path: string) => !path.startsWith("/futures") },
  { href: "/futures", label: "Futures", isActive: (path: string) => path.startsWith("/futures") },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-44 shrink-0 flex-col pt-8">
      <nav className="flex flex-col">
        {SECTIONS.map((section) => {
          const active = section.isActive(pathname);
          return (
            <Link
              key={section.href}
              href={section.href}
              className={`relative px-5 py-2.5 text-sm uppercase tracking-wider transition-colors duration-300 ${
                active ? "text-accent" : "text-ink-faint hover:text-ink-dim"
              }`}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 animate-fade-in-fast bg-accent"
                  style={{ width: "3px", height: "16px", transform: "translateY(-50%)" }}
                />
              )}
              {section.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
