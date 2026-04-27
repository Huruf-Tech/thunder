import { loadHooks } from "./hooks.ts";
import { findRouter } from "./routes.ts";
import { TMethod, TRouteExecutor } from "./router.ts";

export const discover = async (req: Request): Promise<TRouteExecutor> => {
  const url = new URL(req.url);

  const pathnameParts = url.pathname.split("/").filter(
    Boolean,
  );
  const [namespace, ...endpointParts] = pathnameParts;

  const { fallback, router } = await findRouter(
    `./**/*.ts`,
    namespace + ".ts",
  );

  const resolvedEndpoint = fallback
    ? `/${pathnameParts.join("/") ?? ""}`
    : `/${endpointParts.join("/") ?? ""}`;

  const exec = router.route(
    req.method.toLowerCase() as TMethod,
    resolvedEndpoint,
  );

  return async (req: Request) =>
    typeof exec === "function"
      ? await exec(
        req,
        ...(await loadHooks(`./**/*.ts`)),
      )
      : new Response("Not found", { status: 404 });
};
