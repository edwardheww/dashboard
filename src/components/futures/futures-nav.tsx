"use client";

import { TabDropdown } from "@/components/tab-dropdown";

const LINKS = [
  { href: "/futures", label: "Sentiment" },
  { href: "/futures/trade-log", label: "Trade Log" },
  { href: "/futures/calendar", label: "Calendar" },
];

export function FuturesNav() {
  return <TabDropdown links={LINKS} />;
}
