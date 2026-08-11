"use client";

import { useState } from "react";
import type { NewTradeLogEntryInput } from "@/lib/trade-log";
import { resizeImageFile } from "@/lib/image-resize";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const inputClass =
  "w-full border border-line bg-void px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";
const labelClass = "text-[11px] uppercase tracking-wider text-ink-faint";

function FileButton({
  id,
  label,
  file,
  onChange,
}: {
  id: string;
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <label
          htmlFor={id}
          className="inline-block shrink-0 cursor-pointer border border-line bg-line px-3 py-2 font-mono text-xs text-ink-dim transition-colors duration-300 hover:text-ink"
        >
          Choose file
        </label>
        <input
          id={id}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
        {file && <span className="truncate font-mono text-xs text-ink-faint">{file.name}</span>}
      </div>
    </div>
  );
}

export function TradeLogForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: NewTradeLogEntryInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [entryDate, setEntryDate] = useState(todayIso());
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [cvd, setCvd] = useState("");
  const [rr, setRr] = useState("");
  const [chart5m15mFile, setChart5m15mFile] = useState<File | null>(null);
  const [chart1mFile, setChart1mFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!entryDate) return setError("Date is required.");
    const aiAnalysisNum = aiAnalysis.trim() === "" ? null : Number(aiAnalysis);
    if (aiAnalysisNum !== null && (!Number.isFinite(aiAnalysisNum) || aiAnalysisNum < 0 || aiAnalysisNum > 100)) {
      return setError("AI Analysis must be 0-100.");
    }
    const cvdNum = cvd.trim() === "" ? null : Number(cvd);
    if (cvdNum !== null && !Number.isFinite(cvdNum)) return setError("CVD must be a number.");
    const rrNum = rr.trim() === "" ? null : Number(rr);
    if (rrNum !== null && !Number.isFinite(rrNum)) return setError("RR must be a number.");

    setError(null);
    setSubmitting(true);
    try {
      const [chart5m15m, chart1m] = await Promise.all([
        chart5m15mFile ? resizeImageFile(chart5m15mFile) : Promise.resolve(null),
        chart1mFile ? resizeImageFile(chart1mFile) : Promise.resolve(null),
      ]);

      await onSubmit({
        entryDate,
        aiAnalysis: aiAnalysisNum,
        cvd: cvdNum,
        rr: rrNum,
        chart5m15m,
        chart1m,
      });

      setEntryDate(todayIso());
      setAiAnalysis("");
      setCvd("");
      setRr("");
      setChart5m15mFile(null);
      setChart1mFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add trade log entry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-line bg-panel p-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
        <div>
          <label className={labelClass} htmlFor="tl-date">Date</label>
          <input
            id="tl-date"
            type="date"
            className={`${inputClass} mt-2`}
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="tl-ai">AI Analysis</label>
          <input
            id="tl-ai"
            type="number"
            step="1"
            min="0"
            max="100"
            className={`${inputClass} mt-2`}
            value={aiAnalysis}
            onChange={(e) => setAiAnalysis(e.target.value)}
            placeholder="0-100"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="tl-cvd">CVD</label>
          <input
            id="tl-cvd"
            type="number"
            step="any"
            className={`${inputClass} mt-2`}
            value={cvd}
            onChange={(e) => setCvd(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="tl-rr">RR</label>
          <input
            id="tl-rr"
            type="number"
            step="any"
            className={`${inputClass} mt-2`}
            value={rr}
            onChange={(e) => setRr(e.target.value)}
            placeholder="2.5 or -1"
            title="Signed R-multiple: positive for a win, negative for a loss"
          />
        </div>
        <FileButton id="tl-chart-5m" label="5m/15m Chart" file={chart5m15mFile} onChange={setChart5m15mFile} />
        <FileButton id="tl-chart-1m" label="1m Chart" file={chart1mFile} onChange={setChart1mFile} />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="h-[38px] bg-accent px-5 text-sm font-medium uppercase tracking-wider text-void transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {submitting ? "Adding…" : "Add entry"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-ink-faint transition-colors duration-300 hover:text-ink"
          >
            Cancel
          </button>
        )}
        {error && (
          <span className="text-sm text-loss" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
