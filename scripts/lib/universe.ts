/** Universe selection (`--universe=megacap|nextgen100`) shared by the universe-parameterized backtests. */
import path from "node:path";
import type { Constituent } from "../../src/lib/types";
import { SCREENING_UNIVERSE } from "../../src/lib/universe"; // live app's universe: Nasdaq-100 mega-caps
import { NASDAQ_NEXT_GEN_100 } from "../nasdaq-next-gen-100"; // backtest-only comparison universe
import { argValue } from "./stats";

export const UNIVERSE_NAME = argValue("universe", "megacap") === "nextgen100" ? "nextgen100" : "megacap";
export const SCREENING_SET: Constituent[] = UNIVERSE_NAME === "nextgen100" ? NASDAQ_NEXT_GEN_100 : SCREENING_UNIVERSE;
export const SYMBOLS = SCREENING_SET.map((c) => c.symbol);
export const BARS_CACHE_PATH = path.join(process.cwd(), "data", `backtest-bars-cache.${UNIVERSE_NAME}.json`);
