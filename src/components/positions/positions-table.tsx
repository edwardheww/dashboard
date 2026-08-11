"use client";

import { useState } from "react";
import type { PositionWithPnl } from "@/lib/types";
import { formatSignedPct, formatUsd } from "@/lib/format";

const th = "p-3 text-[11px] font-normal uppercase tracking-wider text-ink-faint";
const td = "p-3 align-middle";

type UpdateFn = (id: number, update: { exitPrice?: number; exitDate?: string; notes?: string | null }) => Promise<void>;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Complete 24h days elapsed from a date-only string to now — entryDate has no time component, so this is entry's midnight UTC to the current instant. */
function daysSince(dateStr: string): number {
  const start = new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((Date.now() - start) / MS_PER_DAY));
}

/** Complete 24h days between two date-only strings. */
function daysBetween(startStr: string, endStr: string): number {
  const start = new Date(`${startStr}T00:00:00Z`).getTime();
  const end = new Date(`${endStr}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((end - start) / MS_PER_DAY));
}

function PnlCells({ pnl, pnlPct }: { pnl: number | null; pnlPct: number | null }) {
  if (pnl === null || pnlPct === null) {
    return (
      <>
        <td className={`${td} font-mono text-ink-faint`}>—</td>
        <td className={`${td} font-mono text-ink-faint`}>—</td>
      </>
    );
  }
  const color = pnl >= 0 ? "text-accent" : "text-loss";
  return (
    <>
      <td className={`${td} font-mono tabular-nums ${color}`}>{formatUsd(pnl)}</td>
      <td className={`${td} font-mono tabular-nums ${color}`}>{formatSignedPct(pnlPct)}</td>
    </>
  );
}

function NotesCell({ id, notes, onUpdate }: { id: number; notes: string | null; onUpdate: UpdateFn }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    try {
      await onUpdate(id, { notes: value.trim() === "" ? null : value.trim() });
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <td className={`${td} text-ink-dim`}>
        <button
          type="button"
          onClick={() => {
            setValue(notes ?? "");
            setEditing(true);
          }}
          className="text-left transition-colors duration-300 hover:text-ink"
          title="Click to edit"
        >
          {notes ?? "—"}
        </button>
      </td>
    );
  }

  return (
    <td className={td}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-40 border border-line bg-void px-2 py-1 font-mono text-xs text-ink focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="text-[11px] uppercase tracking-wider text-accent transition-opacity duration-300 hover:opacity-80 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[11px] uppercase tracking-wider text-ink-faint transition-colors duration-300 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </td>
  );
}

function OpenRow({
  position,
  onUpdate,
  onDelete,
}: {
  position: PositionWithPnl;
  onUpdate: UpdateFn;
  onDelete: (id: number) => Promise<void>;
}) {
  const [closing, setClosing] = useState(false);
  const [exitPrice, setExitPrice] = useState("");
  const [exitDate, setExitDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);

  async function handleClose() {
    const priceNum = Number(exitPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return;
    setSubmitting(true);
    try {
      await onUpdate(position.id, { exitPrice: priceNum, exitDate });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <tr className="border-b border-line">
      <td className={`${td} font-mono text-ink`}>{position.ticker}</td>
      <td className={`${td} font-mono tabular-nums text-ink-dim`}>{position.shares}</td>
      <td className={`${td} font-mono tabular-nums text-ink-dim`}>{formatUsd(position.entryPrice)}</td>
      <td className={`${td} font-mono tabular-nums text-ink-dim`}>{daysSince(position.entryDate)}d</td>
      <td className={`${td} font-mono tabular-nums text-ink-dim`}>
        {position.currentPrice !== null ? formatUsd(position.currentPrice) : "—"}
      </td>
      <PnlCells pnl={position.pnl} pnlPct={position.pnlPct} />
      <NotesCell id={position.id} notes={position.notes} onUpdate={onUpdate} />
      <td className={`${td} text-right`}>
        {closing ? (
          <div className="flex items-center justify-end gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              placeholder="Exit price"
              className="w-24 border border-line bg-void px-2 py-1 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
            <input
              type="date"
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
              className="border border-line bg-void px-2 py-1 font-mono text-xs text-ink focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="bg-accent px-3 py-1 text-[11px] uppercase tracking-wider text-void transition-opacity duration-300 hover:opacity-90 disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => setClosing(true)}
              className="text-[11px] uppercase tracking-wider text-ink-faint transition-colors duration-300 hover:text-accent"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => onDelete(position.id)}
              className="text-[11px] uppercase tracking-wider text-ink-faint transition-colors duration-300 hover:text-loss"
            >
              Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function ClosedRow({
  position,
  onUpdate,
  onDelete,
}: {
  position: PositionWithPnl;
  onUpdate: UpdateFn;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editingExit, setEditingExit] = useState(false);
  const [exitPrice, setExitPrice] = useState(String(position.exitPrice ?? ""));
  const [exitDate, setExitDate] = useState(position.exitDate ?? todayIso());
  const [submitting, setSubmitting] = useState(false);

  async function handleSaveExit() {
    const priceNum = Number(exitPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return;
    setSubmitting(true);
    try {
      await onUpdate(position.id, { exitPrice: priceNum, exitDate });
      setEditingExit(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <tr className="border-b border-line">
      <td className={`${td} font-mono text-ink-dim`}>{position.ticker}</td>
      <td className={`${td} font-mono tabular-nums text-ink-dim`}>{position.shares}</td>
      <td className={`${td} font-mono tabular-nums text-ink-dim`}>{formatUsd(position.entryPrice)}</td>
      <td className={`${td} font-mono tabular-nums text-ink-dim`}>
        {position.exitDate ? `${daysBetween(position.entryDate, position.exitDate)}d` : "—"}
      </td>
      <td className={td}>
        {editingExit ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              className="w-24 border border-line bg-void px-2 py-1 font-mono text-xs text-ink focus:border-accent focus:outline-none"
            />
            <input
              type="date"
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
              className="border border-line bg-void px-2 py-1 font-mono text-xs text-ink focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveExit}
              disabled={submitting}
              className="text-[11px] uppercase tracking-wider text-accent transition-opacity duration-300 hover:opacity-80 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingExit(false)}
              className="text-[11px] uppercase tracking-wider text-ink-faint transition-colors duration-300 hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setExitPrice(String(position.exitPrice ?? ""));
              setExitDate(position.exitDate ?? todayIso());
              setEditingExit(true);
            }}
            className="font-mono tabular-nums text-ink-dim transition-colors duration-300 hover:text-ink"
            title="Click to correct exit price/date"
          >
            {position.exitPrice !== null ? formatUsd(position.exitPrice) : "—"}
          </button>
        )}
      </td>
      <PnlCells pnl={position.pnl} pnlPct={position.pnlPct} />
      <NotesCell id={position.id} notes={position.notes} onUpdate={onUpdate} />
      <td className={`${td} text-right`}>
        <button
          type="button"
          onClick={() => onDelete(position.id)}
          className="text-[11px] uppercase tracking-wider text-ink-faint transition-colors duration-300 hover:text-loss"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

export function PositionsTable({
  positions,
  onUpdate,
  onDelete,
}: {
  positions: PositionWithPnl[];
  onUpdate: UpdateFn;
  onDelete: (id: number) => Promise<void>;
}) {
  if (positions.length === 0) {
    return (
      <div className="border border-line p-8 text-center">
        <p className="text-sm text-ink-dim">No positions logged yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className={th}>Ticker</th>
            <th className={th}>Shares</th>
            <th className={th}>Entry</th>
            <th className={th}>Hold</th>
            <th className={th}>Exit / Current</th>
            <th className={th}>P&amp;L</th>
            <th className={th}>P&amp;L %</th>
            <th className={th}>Notes</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) =>
            p.status === "open" ? (
              <OpenRow key={p.id} position={p} onUpdate={onUpdate} onDelete={onDelete} />
            ) : (
              <ClosedRow key={p.id} position={p} onUpdate={onUpdate} onDelete={onDelete} />
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
