import { relative } from "@std/path/relative";

export type THandler = (req: Request) => Response;
export type THandlerOpts = {
  shape?: unknown;
  handler: THandler;
};
export type TPreparedHandler = THandlerOpts | THandler;
export type TPrepareHandler = () => TPreparedHandler;

export const get = (
  path: string,
  prepare: TPrepareHandler,
) => {
  const stack = new Error().stack!;

  const [, routerPath] = stack.split("\n").pop()?.match(
    /at\sfile:\/\/\/(.*):[0-9]+:[0-9]+/,
  ) ?? [];

  const [, ...resolvedPath] = relative(Deno.cwd(), routerPath).replaceAll(
    "\\",
    "/",
  ).split("/");

  const namespace = resolvedPath.join("/").replace(/\/api|\.ts/g, "") || "/";

  ((routes[namespace] ??= {})["get"] ??= []).push({
    path,
    opts: prepare(),
  });
};

export type TRoute = {
  path: string;
  opts: TPreparedHandler;
};

export const routes = {} as Record<string, Record<string, TRoute[]>>;
