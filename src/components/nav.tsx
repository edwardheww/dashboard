"use client";

import { TabDropdown } from "@/components/tab-dropdown";

const LINKS = [
  { href: "/", label: "Screener" },
  { href: "/positions", label: "Positions" },
];

export function Nav() {
  return <TabDropdown links={LINKS} />;
}
