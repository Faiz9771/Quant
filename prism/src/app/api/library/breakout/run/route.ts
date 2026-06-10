import { NextResponse } from "next/server";
import { getBreakoutRunner } from "@/lib/breakout-runner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let body: { refreshUniverse?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      /* empty body is OK */
    }
    const runner = getBreakoutRunner();
    const state = runner.start({
      refreshUniverse: body.refreshUniverse === true,
    });
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
