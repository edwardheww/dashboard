export type Constituent = {
  symbol: string;
  name: string;
  sector: string;
};

export type Quote = {
  symbol: string;
  price: number;
  changePercentage: number;
  marketCap: number | null;
  volume: number | null;
};

export type DailyBar = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

export type Factor = {
  key: string;
  label: string;
  score: number;
};

export type StockResult = {
  rank: number;
  ticker: string;
  name: string;
  sector: string;
  price: number;
  overallScore: number;
  priceTarget: number;
  upsidePct: number;
  // Average true range as % of price — typical move size, not a ranked
  // factor (see scoring.ts for why volatility isn't scored as "better").
  typicalMovePct: number | null;
  thesis: string;
  factors: Factor[];
};

export type ScreenResponse = {
  results: StockResult[];
  generatedAt: string;
};

export type SavedScan = {
  id: number;
  generatedAt: string;
  results: StockResult[];
};

export type Position = {
  id: number;
  ticker: string;
  shares: number;
  entryPrice: number;
  entryDate: string;
  exitPrice: number | null;
  exitDate: string | null;
  aiTarget: number | null;
  thesis: string | null;
  notes: string | null;
  createdAt: string;
};

export type PositionWithPnl = Position & {
  status: "open" | "closed";
  currentPrice: number | null;
  pnl: number | null;
  pnlPct: number | null;
};

export type NewPositionInput = {
  ticker: string;
  shares: number;
  entryPrice: number;
  entryDate: string;
  aiTarget?: number | null;
  thesis?: string | null;
  notes?: string | null;
};

// All fields optional — PATCH only touches whichever are present. Covers
// closing a position (exitPrice + exitDate), correcting an exit after the
// fact, and editing notes independent of exit state.
export type PositionUpdateInput = {
  exitPrice?: number;
  exitDate?: string;
  notes?: string | null;
};
