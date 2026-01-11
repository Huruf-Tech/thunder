import { serveApi, serveAssets } from "@/core/http/middlewares.ts";

export default {
  async fetch(req) {
    const middlewares = [
      serveApi,
      serveAssets,
    ];

    for (const middleware of middlewares) {
      const res = await middleware(req);

      if (res instanceof Response) {
        return res;
      }
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies Deno.ServeDefaultExport;
