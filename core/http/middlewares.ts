import { routes } from "./methods.ts";
import { pathToRegexp } from "path-to-regexp";
import { z, ZodError } from "zod";
import { existsSync } from "@std/fs";
import { join } from "@std/path/join";
import { serveFile } from "@std/http/file-server";

export const serveApi = async (req: Request) => {
  try {
    const url = new URL(req.url);

    let namespace;
    let router;
    let endpoint;

    if (/\/api\/~(\/.*|$)/.test(url.pathname)) {
      const [_router, ..._endpoint] = url.pathname
        .replace("/api/~", "")
        .split("/")
        .filter(Boolean);

      namespace = "";
      router = _router ?? "";
      endpoint = _endpoint.join("/") || "/";

      await import(`../../api/${router}.ts`);
    } else if (/\/api\/.*/.test(url.pathname)) {
      const [_namespace, _plugin, _router, ..._endpoint] = url.pathname
        .replace("/api/", "")
        .split("/")
        .filter(Boolean);

      namespace = [_namespace, _plugin].join("/");
      router = _router ?? "";
      endpoint = _endpoint.join("/") || "/";

      await import(`../../plugins/${namespace}/api/${router}.ts`);
    }

    if (
      typeof namespace === "string" &&
      typeof router === "string" &&
      typeof endpoint === "string"
    ) {
      for (
        const route
          of routes[[namespace, router].join("/")][req.method.toLowerCase()]
      ) {
        const regexp = pathToRegexp(route.path).regexp;

        if (!regexp.test(endpoint)) continue;

        try {
          if (typeof route.opts === "function") {
            return route.opts(req);
          }

          return route.opts.handler(req);
        } catch (error) {
          if (error instanceof ZodError) {
            return Response.json({
              error: z.prettifyError(error),
            }, { status: 400 });
          }

          return Response.json({
            error,
          }, { status: 500 });
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
};

export const serveAssets = async (req: Request) => {
  const url = new URL(req.url);

  const [namespace, ...subPath] = url.pathname.split("/").filter(Boolean);

  const root = join(Deno.cwd(), "public", namespace || "~", "www");

  if (!existsSync(root)) return;

  let IndexFile = "index.html";

  if (!existsSync(join(root, IndexFile))) {
    const WWWItems = Deno.readDirSync(root);

    for (const item of WWWItems) {
      if (!item.isDirectory && /^index.*/.test(item.name)) {
        IndexFile = item.name;
        break;
      }
    }
  }

  return await serveFile(req, join(root, ...subPath)).then(async (res) => {
    if (res.status === 404) {
      return await serveFile(req, join(root, IndexFile));
    }

    return res;
  });
};
