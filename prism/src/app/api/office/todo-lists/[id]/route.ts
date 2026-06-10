import { NextResponse } from "next/server";
import {
  deleteTodoListRow,
  getTodoList,
  upsertTodoList,
} from "@/lib/office/db";
import type { TodoList } from "@/lib/office/types";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const list = getTodoList(id);
    if (!list) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ list });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Partial<TodoList>;
    if (!body || typeof body !== "object" || body.id !== id) {
      return NextResponse.json(
        { error: "Body id must match route id" },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        { error: "items must be an array" },
        { status: 400 }
      );
    }
    upsertTodoList(body as TodoList);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    deleteTodoListRow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
