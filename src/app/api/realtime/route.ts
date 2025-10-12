import { NextRequest } from "next/server";
import { registerClient, unregisterClient } from "@/lib/sse";

export async function GET(_req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const client = {
        send: (data: string) => controller.enqueue(encoder.encode(data)),
        close: () => controller.close(),
      };
      registerClient(client);
      controller.enqueue(encoder.encode(`retry: 3000\n\n`));
      controller.enqueue(encoder.encode(`event: ready\n` + `data: {}\n\n`));
      return () => unregisterClient(client);
    },
    cancel() {},
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}


