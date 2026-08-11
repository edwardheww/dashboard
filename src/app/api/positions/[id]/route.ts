import { NextResponse } from "next/server";
import { deletePosition, getPosition, updatePosition } from "@/lib/positions";
import type { PositionUpdateInput } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Partial update — only touches fields present in the body. Covers closing
 * a position (exitPrice + exitDate together), correcting an exit already
 * set, and editing notes independently of exit state.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const positionId = Number(id);
  if (!Number.isInteger(positionId)) {
    return NextResponse.json({ error: "Invalid position id." }, { status: 400 });
  }
  if (!getPosition(positionId)) {
    return NextResponse.json({ error: "Position not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Partial<PositionUpdateInput> | null;
  if (!body || (body.exitPrice === undefined && body.exitDate === undefined && body.notes === undefined)) {
    return NextResponse.json({ error: "Nothing to update — provide exitPrice/exitDate and/or notes." }, { status: 400 });
  }

  const update: PositionUpdateInput = {};

  if (body.exitPrice !== undefined) {
    if (typeof body.exitPrice !== "number" || body.exitPrice <= 0) {
      return NextResponse.json({ error: "exitPrice must be a positive number." }, { status: 400 });
    }
    update.exitPrice = body.exitPrice;
  }
  if (body.exitDate !== undefined) {
    if (typeof body.exitDate !== "string" || !body.exitDate) {
      return NextResponse.json({ error: "exitDate must be a non-empty string." }, { status: 400 });
    }
    update.exitDate = body.exitDate;
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ error: "notes must be a string or null." }, { status: 400 });
    }
    update.notes = body.notes;
  }

  const position = updatePosition(positionId, update);
  return NextResponse.json({ position });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const positionId = Number(id);
  if (!Number.isInteger(positionId)) {
    return NextResponse.json({ error: "Invalid position id." }, { status: 400 });
  }

  deletePosition(positionId);
  return NextResponse.json({ ok: true });
}
