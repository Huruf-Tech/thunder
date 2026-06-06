import z, { ZodError } from "zod";
import { match, MatchFunction, MatchResult } from "path-to-regexp";
import { THook } from "./hooks.ts";
import { paramsMap } from "./constants.ts";
import { Env, EnvType } from "../utils/env.ts";

export type TResponse = Response | Promise<Response>;
export type THandler = (req: Request) => TResponse;
export type TNextFunction = () => TResponse;
export type TMiddleware = (req: Request, next: TNextFunction) => TResponse;
export type THandlerIOShapes = {
  headers?: z.ZodType<Record<string, unknown>, Record<string, unknown>>;
  params?: z.ZodType<Record<string, unknown>, Record<string, unknown>>;
  query?: z.ZodType<Record<string, unknown>, Record<string, unknown>>;
  body?: z.ZodType;
  return?: z.ZodType;
};
export type TPrepareHandlerIOShapes = () => THandlerIOShapes;
export type THandlerOpts = {
  shape?: TPrepareHandlerIOShapes;
  handler: THandler;
};
export type TPreparedHandler = THandlerOpts | THandler;
export type TPrepareHandler = () => TPreparedHandler;
export type TMethod = "get" | "post" | "patch" | "put" | "delete" | "all";
export type TRouteExecutor = (req: Request) => Promise<Response> | Response;

export type TRegisterMethod = (
  path: string,
  prepare: TPrepareHandler,
) => Router;

export type TRouter = Record<
  Exclude<TMethod, "delete"> | "del",
  TRegisterMethod
>;

export type TRouteMetadataValue =
  | string
  | number
  | boolean
  | { [key: string]: TRouteMetadataValue }
  | TRouteMetadataValue[];

export type TRouteMetadata = {
  [key: string]: TRouteMetadataValue;
};

export type TRouteOptions = {
  root?: string;
  metadata?: TRouteMetadata;
  registerFn: TRegisterFn;
};

export type TRegisterFn = (
  router: TRouter,
) => void;

export class Router {
  protected rootPath?: string;
  protected parser?: MatchFunction<Record<string, string>>;
  protected methodNames = new Set<string>();
  protected registry: Map<
    string,
    {
      fullPath: string;
      endpoint: string;
      isStatic: boolean;
      parser: MatchFunction<Record<string, string>>;
      methods: {
        [K in TMethod]?: {
          name: string;
          handler: TPreparedHandler;
        };
      };
    }
  > = new Map();

  public name: string;
  public groupName?: string;
  public metadata?: TRouteMetadata;

  constructor(
    registerFn: TRegisterFn,
  );
  constructor(
    root: string,
    registerFn: TRegisterFn,
  );
  constructor(
    opts: TRouteOptions,
  );
  constructor(
    opts: string | TRegisterFn | TRouteOptions,
    registerFn?: TRegisterFn,
  ) {
    let rootPath: string | undefined;
    let fn: TRegisterFn;

    if (typeof opts === "function") {
      fn = opts;
    } else if (typeof opts === "object") {
      rootPath = opts.root;

      if (!opts.registerFn) {
        throw new Error("Register function must be provided!");
      }

      fn = opts.registerFn;
      this.metadata = opts.metadata;
    } else {
      rootPath = opts;

      if (!registerFn) {
        throw new Error("Register function must be provided!");
      }

      fn = registerFn;
    }

    if (!fn.name) {
      throw new Error("A named function should be passed to router!");
    }

    this.name = fn.name;

    if (rootPath) {
      this.rootPath = rootPath;
      this.parser = match(`/${rootPath.replace(/^\/|\/$/g, "")}{*__endpoint}`);
    }

    // deno-lint-ignore no-explicit-any
    fn(this as any);
  }

  protected toFullPath(endpoint: string) {
    const fullPath = (this.rootPath?.replace(/^\/|\/$/g, "") ?? "") +
      endpoint;

    return /^\{?\//.test(fullPath) ? fullPath : ("/" + fullPath);
  }

  protected registerMethod(
    endpoint: string,
    prepare: TPrepareHandler,
    method?: TMethod,
  ) {
    if (!prepare.name) {
      throw new Error("A named function should be passed to route handler!");
    }

    if (this.methodNames.has(prepare.name)) {
      throw new Error(
        `An endpoint function with same name '${prepare.name}' already exists in this router!`,
      );
    }

    this.methodNames.add(prepare.name);

    const resolvedMethod = method || "all";

    const routing = this.registry.get(endpoint);

    // prepare() runs once at registration (handler + shape snapshot).
    const preparedHandler = prepare();

    if (!routing) {
      this.registry.set(endpoint, {
        fullPath: this.toFullPath(endpoint),
        endpoint,
        // Static endpoints carry no path-to-regexp tokens, so they can be
        // matched with a plain string compare instead of running the regex.
        isStatic: !/[:*{}()?]/.test(endpoint),
        parser: match(endpoint),
        methods: {
          [resolvedMethod]: {
            name: prepare.name,
            handler: preparedHandler,
          },
        },
      });

      return this;
    }

    if (routing.methods[resolvedMethod]) {
      throw new Error(
        "Defining two routes with same endpoint and method is ambiguous!",
      );
    }

    routing.methods[resolvedMethod] = {
      name: prepare.name,
      handler: preparedHandler,
    };

    return this;
  }

  protected get: TRegisterMethod = (path, prepare) =>
    this.registerMethod(path, prepare, "get");

  protected post: TRegisterMethod = (path, prepare) =>
    this.registerMethod(path, prepare, "post");

  protected patch: TRegisterMethod = (path, prepare) =>
    this.registerMethod(path, prepare, "patch");

  protected put: TRegisterMethod = (path, prepare) =>
    this.registerMethod(path, prepare, "put");

  protected del: TRegisterMethod = (path, prepare) =>
    this.registerMethod(path, prepare, "delete");

  protected all: TRegisterMethod = (path, prepare) =>
    this.registerMethod(path, prepare);

  protected toErrorResponse(error: unknown): Response {
    if (error instanceof ZodError) {
      return Response.json({
        error: z.prettifyError(error),
      }, { status: 400 });
    }

    if (error instanceof Response) {
      return error;
    }

    return Response.json({
      error: error instanceof Error
        ? {
          message: error.message,
          name: error.name,
          stack: Env.is(EnvType.DEVELOPMENT) ? error.stack : undefined,
        }
        : error,
    }, { status: 500 });
  }

  protected async runPreHooksAndHandler(
    req: Request,
    hooks: THook[],
    details:
      | {
        name?: string;
        handler?: TPreparedHandler;
      }
      | undefined,
    routeMatch: MatchResult<Record<string, string>> | undefined,
  ): Promise<Response> {
    for (const hook of hooks) {
      if (typeof hook.pre === "function") {
        const hookRes = await hook.pre({
          req,
          scope: this.name,
          name: details?.name,
        });

        if (hookRes instanceof Response) return hookRes;
      }
    }

    if (routeMatch) {
      paramsMap.set(req, routeMatch.params);
    } else {
      paramsMap.delete(req);
    }

    const handler = details?.handler;

    if (typeof handler === "function") {
      return await handler(req);
    }

    return await handler?.handler(req) ??
      new Response("Request handler not found", { status: 404 });
  }

  protected async execute(
    req: Request,
    hooks: THook[],
    details:
      | {
        name?: string;
        handler?: TPreparedHandler;
      }
      | undefined,
    routeMatch: MatchResult<Record<string, string>> | undefined,
  ): Promise<Response> {
    try {
      // Inner boundary: turn handler/pre-hook errors into a Response so that
      // post hooks still observe a response, mirroring the original behaviour.
      let res: Response;

      try {
        res = await this.runPreHooksAndHandler(req, hooks, details, routeMatch);
      } catch (error) {
        res = this.toErrorResponse(error);
      }

      for (const hook of hooks) {
        if (typeof hook.post === "function") {
          const hookRes = await hook.post({
            req,
            res,
            scope: this.name,
            name: details?.name,
          });

          if (hookRes instanceof Response) return hookRes;
        }
      }

      return res;
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  protected handle = (
    details?: {
      name?: string;
      handler?: TPreparedHandler;
    },
    routeMatch?: MatchResult<Record<string, string>>,
  ) => {
    return (req: Request, hooks: THook[] = EMPTY_HOOKS) =>
      this.execute(req, hooks, details, routeMatch);
  };

  public group(name: string) {
    this.groupName = name;

    return this;
  }

  public route(method: TMethod, endpoint: string) {
    let targetEndpoint = endpoint;

    if (this.parser) {
      const routeMatch = this.parser(endpoint);

      if (!routeMatch) return;

      targetEndpoint = "/" +
        ((routeMatch.params.__endpoint as unknown as Array<string> | undefined)
          ?.filter(Boolean).join("/") ?? "");
    }

    for (const routing of this.registry.values()) {
      // Static endpoints skip the regex and match by string equality; dynamic
      // ones still run their compiled matcher. Registration order is preserved
      // either way, so route precedence is unchanged.
      let routeMatch: MatchResult<Record<string, string>> | undefined;

      if (routing.isStatic) {
        if (routing.endpoint !== targetEndpoint) continue;
        routeMatch = STATIC_MATCH;
      } else {
        const matched = routing.parser(targetEndpoint);
        if (!matched) continue;
        routeMatch = matched;
      }

      const handlerObj = routing.methods[method] || routing.methods["all"];

      if (handlerObj) {
        return this.handle(handlerObj, routeMatch);
      }
    }

    return this.handle();
  }
}

const EMPTY_HOOKS: THook[] = [];

const STATIC_MATCH: MatchResult<Record<string, string>> = {
  path: "",
  params: Object.freeze({}) as Record<string, string>,
};
