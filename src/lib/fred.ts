/**
 * FRED (Federal Reserve Economic Data) — free API, requires a personal key
 * from https://fred.stlouisfed.org/docs/api/api_key.html, set as
 * FRED_API_KEY in .env.local. Entirely optional: if the key isn't set, the
 * macro layer is silently omitted from the sentiment read rather than
 * failing it. Server-side only, same handling as GROQ_API_KEY — never
 * logged, never sent anywhere but FRED's API.
 */
export type MacroSnapshot = {
  vix: { value: number; change: number } | null;
  yield10y: { value: number; change: number } | null;
};

type FredPoint = { value: number; date: string };

const ENDPOINT = "https://api.stlouisfed.org/fred/series/observations";

async function fetchSeries(seriesId: string, apiKey: string): Promise<FredPoint[]> {
  const url = `${ENDPOINT}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=5`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];

  const data = await res.json();
  const observations = Array.isArray(data?.observations) ? data.observations : [];

  const points: FredPoint[] = [];
  for (const o of observations) {
    const value = typeof o?.value === "string" ? Number(o.value) : NaN;
    if (Number.isFinite(value) && typeof o?.date === "string") points.push({ value, date: o.date });
  }
  return points;
}

function toLatestWithChange(points: FredPoint[]): { value: number; change: number } | null {
  if (points.length === 0) return null;
  const [latest, ...rest] = points;
  const prior = rest[0] ?? null;
  return { value: latest.value, change: prior ? latest.value - prior.value : 0 };
}

export async function fetchMacroSnapshot(): Promise<MacroSnapshot | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const [vixPoints, yieldPoints] = await Promise.all([fetchSeries("VIXCLS", apiKey), fetchSeries("DGS10", apiKey)]);
    return {
      vix: toLatestWithChange(vixPoints),
      yield10y: toLatestWithChange(yieldPoints),
    };
  } catch {
    return null;
  }
}
