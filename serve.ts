import server from "./serve.base.ts";

export default {
  fetch(req) {
    return server(req);
  },
} satisfies Deno.ServeDefaultExport;
