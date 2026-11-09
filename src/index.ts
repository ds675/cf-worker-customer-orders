import type { Env } from "./types";
import { handle } from "./handler";
import { json } from "./lib/http";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (err) {
      const e = err as { stack?: string; message?: string };
      // Full detail goes to the log stream only (server-side, never the client).
      console.error("worker_error:", e?.stack || String(e?.message ?? err));

      // Clients get a generic error in production. The raw message is exposed
      // ONLY when DEBUG is explicitly enabled (dev/staging) — avoids leaking
      // internal endpoints, Shopify error bodies, and stack traces.
      const body =
        env.DEBUG === "true"
          ? { error: "unhandled", message: String(e?.message ?? err) }
          : { error: "internal_error" };
      return json(body, 500);
    }
  },
};
