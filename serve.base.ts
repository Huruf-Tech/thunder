import { serveAssets } from "@/core/middlewares/serveAssets.ts";
import { matchRoute } from "@/core/http/router.ts";

export default async (req: Request) => {
  const exec = await matchRoute("api", req).catch(console.error);

  if (typeof exec === "function") return exec(req);

  return serveAssets(req);
};
