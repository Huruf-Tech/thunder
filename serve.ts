import server from "./serve.base.ts";

export default {
  async fetch(req) {
    return await server(req);
  },
} satisfies Deno.ServeDefaultExport;
