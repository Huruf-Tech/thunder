import { getURL } from "@/core/http/utils.ts";
import { loadHooks } from "./hooks.ts";
import { loadRouters } from "./routes.ts";
import { basename } from "@std/path/basename";
import { Router, TMethod, TRouteExecutor } from "./router.ts";

const GLOB = "./**/*.ts";

// The dispatcher is built once (routers + hooks resolved a single time) and
// reused for every request, instead of re-globbing/re-resolving per request.
let dispatcher: Promise<TRouteExecutor> | undefined;

const buildDispatcher = async (): Promise<TRouteExecutor> => {
  const [routers, hooks] = await Promise.all([
    loadRouters(GLOB),
    loadHooks(GLOB),
  ]);

  // First match wins, mirroring the previous glob-order findRouter() lookup.
  const byNamespace = new Map<string, Router>();

  for (const { router, path } of routers) {
    const namespace = basename(path).replace(/\.ts$/, "");

    if (!byNamespace.has(namespace)) byNamespace.set(namespace, router);
  }

  const indexRouter = byNamespace.get("index");

  return (req: Request) => {
    const url = getURL(req);

    const pathnameParts = url.pathname.split("/").filter(Boolean);
    const [namespace, ...endpointParts] = pathnameParts;

    const matched = namespace ? byNamespace.get(namespace) : undefined;
    const router = matched ?? indexRouter;

    if (!router) return new Response("Not found", { status: 404 });

    const resolvedEndpoint = matched
      ? `/${endpointParts.join("/")}`
      : url.pathname;

    const exec = router.route(
      req.method.toLowerCase() as TMethod,
      resolvedEndpoint,
    );

    if (typeof exec === "function") return exec(req, hooks);

    return new Response("Not found", { status: 404 });
  };
};

export const discover = (_req?: Request): Promise<TRouteExecutor> => {
  if (!dispatcher) dispatcher = buildDispatcher();

  return dispatcher;
};
