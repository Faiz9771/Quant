import { NextResponse } from "next/server";
import { listAllDocs, listAllTodoLists } from "@/lib/office/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const docs = listAllDocs();
    const todoLists = listAllTodoLists();
    return NextResponse.json({ docs, todoLists });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
