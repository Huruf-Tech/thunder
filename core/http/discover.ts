import { getURL } from "@/core/http/utils.ts";
import { loadHooks } from "./hooks.ts";
import { findRouter } from "./routes.ts";
import { TMethod, TRouteExecutor } from "./router.ts";

export const discover = async (req: Request): Promise<TRouteExecutor> => {
  const url = getURL(req);

  const pathnameParts = url.pathname.split("/").filter(
    Boolean,
  );
  const [namespace, ...endpointParts] = pathnameParts;

  const { fallback, router } = await findRouter(
    `./**/*.ts`,
    namespace + ".ts",
  );

  const resolvedEndpoint = fallback
    ? url.pathname
    : `/${endpointParts.join("/") ?? ""}`;

  const exec = router.route(
    req.method.toLowerCase() as TMethod,
    resolvedEndpoint,
  );

  return async (req: Request) => {
    if (typeof exec === "function") {
      return await exec(
        req,
        ...(await loadHooks(`./**/*.ts`)),
      );
    }

    return new Response("Not found", { status: 404 });
  };
};
