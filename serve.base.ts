import { serveAssets } from "@/core/middlewares/serveAssets.ts";
import { matchRoute } from "@/core/http/router.ts";

export default async (req: Request) => {
  const exec = await matchRoute(req, {
    api: "./api",
    hooks: "./hooks",
  }).catch(console.error);

  if (typeof exec === "function") return exec(req);

  return serveAssets(req);
};
