import { getScraperRunner } from "@/lib/scraper-runner";
import type { ScraperLogLine } from "@/lib/scraper-runner";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of scraper log lines.
 * - Replays the buffered backlog on connect.
 * - Pushes new lines as they arrive.
 * - Sends heartbeat comments every 15s so proxies don't drop the connection.
 */
export async function GET() {
  const runner = getScraperRunner();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      // Replay the buffered backlog so the UI can hydrate.
      for (const line of runner.getRecentLogs()) {
        send("log", line);
      }
      send("state", runner.getState());

      const unsubscribe = runner.subscribe((line: ScraperLogLine) => {
        send("log", line);
        send("state", runner.getState());
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          /* connection closed */
        }
      }, 15_000);

      // Stash cleanup on the controller so cancel() can find it.
      (controller as unknown as { __cleanup__?: () => void }).__cleanup__ = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
    cancel(reason) {
      void reason;
      const cleanup = (this as unknown as { __cleanup__?: () => void }).__cleanup__;
      if (typeof cleanup === "function") cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
