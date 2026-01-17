import { join } from "@std/path/join";
import z, { ZodError, ZodObject } from "zod";
import { match, pathToRegexp } from "path-to-regexp";
import { basename } from "@std/path/basename";
import { loadHooks, THook } from "./hooks.ts";
import { Logger } from "../common/logger.ts";

export type TResponse = Response | Promise<Response>;
export type THandler = (req: Request) => TResponse;
export type TNextFunction = () => TResponse;
export type TMiddleware = (req: Request, next: TNextFunction) => TResponse;
export type THandlerIOShapes = () => {
  params: ZodObject;
  query: ZodObject;
  body: ZodObject;
  return: ZodObject;
};
export type THandlerOpts = {
  shape?: THandlerIOShapes;
  handler: THandler;
};
export type TPreparedHandler = THandlerOpts | THandler;
export type TPrepareHandler = () => TPreparedHandler;
export type TMethod = "get" | "post" | "patch" | "put" | "delete" | "all";
export type TRouteExecutor = (req: Request) => Promise<Response> | Response;

export class Router {
  constructor(public name: string) {}

  protected routesTree: {
    [K in TMethod]?: Map<RegExp, {
      path: string;
      prepare: TPrepareHandler;
    }>;
  } = {};

  public all(
    path: string,
    prepare: TPrepareHandler,
    method?: TMethod,
  ) {
    const routes = this.routesTree[method ?? "all"] ??= new Map();

    routes.set(pathToRegexp(path).regexp, {
      path,
      prepare,
    });

    return this;
  }

  public get(
    path: string,
    prepare: TPrepareHandler,
  ) {
    return this.all(path, prepare, "get");
  }

  public post(
    path: string,
    prepare: TPrepareHandler,
  ) {
    return this.all(path, prepare, "post");
  }

  public patch(
    path: string,
    prepare: TPrepareHandler,
  ) {
    return this.all(path, prepare, "patch");
  }

  public put(
    path: string,
    prepare: TPrepareHandler,
  ) {
    return this.all(path, prepare, "put");
  }

  public delete(
    path: string,
    prepare: TPrepareHandler,
  ) {
    return this.all(path, prepare, "delete");
  }

  public match(method: TMethod, endpoint: string) {
    const mainRoutes = this.routesTree[method];
    const otherRoutes = this.routesTree["all"];

    if (!mainRoutes && !otherRoutes) {
      return (_req: Request) => new Response("Not found", { status: 404 });
    }

    for (const routes of [mainRoutes, otherRoutes]) {
      if (routes) {
        for (const [regex, { path, prepare }] of routes) {
          if (regex.test(endpoint)) {
            const parser = match(path);
            const handlerOpts = prepare();

            return async (req: Request, ...hooks: THook[]) => {
              try {
                for (const hook of hooks) {
                  if (typeof hook.pre === "function") {
                    const hookRes = await hook.pre(
                      this.name,
                      prepare.name,
                      req,
                    );

                    if (hookRes instanceof Response) return hookRes;
                  }
                }

                // deno-lint-ignore ban-ts-comment
                // @ts-ignore
                req._params = parser(endpoint).params;

                let res: Response;

                if (typeof handlerOpts === "function") {
                  res = await handlerOpts(req);
                } else {
                  res = await handlerOpts.handler(req);
                }

                for (const hook of hooks) {
                  if (typeof hook.post === "function") {
                    const hookRes = await hook.post(
                      this.name,
                      prepare.name,
                      req,
                      res,
                    );

                    if (hookRes instanceof Response) return hookRes;
                  }
                }

                return res;
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
            };
          }
        }
      }
    }
  }
}

export const matchRoute = async (
  req: Request,
  opts?: {
    api?: string;
    hooks?: string;
  },
): Promise<TRouteExecutor | undefined> => {
  const url = new URL(req.url);

  const apiPath = opts?.api ?? "api";
  const hooksPath = opts?.hooks ?? "hooks";

  const apiBasename = basename(apiPath);

  if (new RegExp(`\\/${apiBasename}\\/.*`).test(url.pathname)) {
    const pathnameParts = url.pathname
      .replace(`/${apiBasename}/`, "")
      .split("/")
      .filter(Boolean);

    const importPathParts = ["api"];

    while (pathnameParts.length) {
      if (importPathParts.length > 5) throw new Error("Too long path");

      const part = pathnameParts.shift()!;

      const settlements = await Promise.allSettled([
        Deno.stat(
          join(Deno.cwd(), ...importPathParts, part),
        ),
        Deno.stat(
          join(Deno.cwd(), ...importPathParts, part + ".ts"),
        ),
      ]);

      const settled = settlements.find((_) => _.status === "fulfilled");

      if (!settled) throw new Error("Invalid path");

      importPathParts.push(part);

      if (settled.value.isFile) {
        break;
      }
    }

    const importPath = importPathParts.length === 1
      ? `${apiPath}/index`
      : importPathParts.join("/");

    const mod = await import(
      `../../${importPath}.ts`
    );

    const router = mod.default;

    if (router instanceof Router) {
      const exec = router.match(
        req.method.toLowerCase() as TMethod,
        `/${pathnameParts.join("/") ?? ""}`,
      );

      if (!exec) return;

      return async (req: Request) => {
        const res = await exec(
          req,
          ...(await loadHooks(join(hooksPath, "./**/*.ts"))),
        );

        const log = (() => {
          switch (true) {
            case res.status < 299:
              return Logger.success;
            case res.status < 399:
              return Logger.info;
            case res.status < 499:
              return Logger.warn;

            default:
              return Logger.error;
          }
        })();

        log.bind(Logger)(req.method.toUpperCase(), req.url, res.status);

        return res;
      };
    }

    throw new Error("Not a valid router");
  }
};
