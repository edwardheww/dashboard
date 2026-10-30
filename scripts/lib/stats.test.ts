import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { DailyBar } from "../../src/lib/types";
import {
  argValue,
  average,
  generateRebalancePoints,
  loadBars,
  median,
  percentileRankNullable,
  rankOf,
  spearman,
  trimExtremes,
} from "./stats";

describe("argValue", () => {
  it("reads --flag=value from argv and falls back when absent", () => {
    const original = process.argv;
    process.argv = [...original, "--universe=nextgen100"];
    try {
      assert.equal(argValue("universe", "megacap"), "nextgen100");
      assert.equal(argValue("lookback", "630"), "630");
    } finally {
      process.argv = original;
    }
  });
});

describe("average / median", () => {
  it("average returns null for an empty list", () => {
    assert.equal(average([]), null);
    assert.equal(average([1, 2, 6]), 3);
  });

  it("median handles odd, even, unsorted, and empty input", () => {
    assert.equal(median([]), 0);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });

  it("median does not mutate its input", () => {
    const values = [3, 1, 2];
    median(values);
    assert.deepEqual(values, [3, 1, 2]);
  });
});

describe("trimExtremes", () => {
  const identity = (v: number) => v;

  it("drops the n lowest and n highest by metric", () => {
    assert.deepEqual(trimExtremes([5, 1, 9, 3, 7], identity, 1), [3, 5, 7]);
    assert.deepEqual(trimExtremes([{ r: 2 }, { r: 9 }, { r: 1 }, { r: 5 }], (x) => x.r, 1), [{ r: 2 }, { r: 5 }]);
  });

  it("returns the input unchanged when n is 0 or there are too few items", () => {
    assert.deepEqual(trimExtremes([3, 1, 2], identity, 0), [3, 1, 2]);
    assert.deepEqual(trimExtremes([3, 1], identity, 1), [3, 1]);
  });
});

describe("rankOf / spearman / percentileRankNullable", () => {
  it("rankOf maps values to 0-100 ranks, with a single value at 50", () => {
    assert.deepEqual(rankOf([10, 30, 20]), [0, 100, 50]);
    assert.deepEqual(rankOf([5]), [50]);
  });

  it("spearman is 1 for a monotonic relationship and -1 for an inverse one", () => {
    assert.ok(Math.abs(spearman([1, 2, 3, 4], [10, 20, 35, 90]) - 1) < 1e-9);
    assert.ok(Math.abs(spearman([1, 2, 3, 4], [9, 7, 4, 1]) + 1) < 1e-9);
  });

  it("spearman is 0 with fewer than two observations", () => {
    assert.equal(spearman([1], [2]), 0);
    assert.equal(spearman([], []), 0);
  });

  it("percentileRankNullable gives nulls and non-finite values the neutral 50", () => {
    assert.deepEqual(percentileRankNullable([null, 10, 30, 20, NaN]), [50, 0, 100, 50, 50]);
  });
});

describe("generateRebalancePoints", () => {
  const bars = (n: number): DailyBar[] =>
    Array.from({ length: n }, (_, i) => ({ date: `d${i}`, open: 1, close: 1, high: 1, low: 1, volume: 1 }));

  it("steps back by the hold period, oldest cycle first", () => {
    // HOLD_TRADING_DAYS = 55, MIN_BARS_REQUIRED = 130
    assert.deepEqual(generateRebalancePoints(new Map([["A", bars(300)]])), [166, 111, 56]);
  });

  it("is empty when no symbol has enough history", () => {
    assert.deepEqual(generateRebalancePoints(new Map([["A", bars(100)]])), []);
    assert.deepEqual(generateRebalancePoints(new Map()), []);
  });
});

describe("loadBars", () => {
  it("reads from the cache without fetching when it exists and refresh is off", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "stats-test-"));
    try {
      const cachePath = path.join(dir, "cache.json");
      const cached = { AAA: [{ date: "d0", open: 1, close: 2, high: 3, low: 0.5, volume: 10 }] };
      writeFileSync(cachePath, JSON.stringify(cached));
      const result = await loadBars(cachePath, ["AAA"], false);
      assert.deepEqual(Object.fromEntries(result), cached);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
