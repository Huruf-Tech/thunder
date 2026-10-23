import { getURL } from "@/core/http/utils.ts";
import { loadHooks } from "./hooks.ts";
import { loadRouters } from "./routes.ts";
import { basename } from "@std/path/basename";
import { Router, TMethod, TRouteExecutor } from "./router.ts";
import { Env } from "@/core/utils/env.ts";

const GLOB = "./**/*.ts";

/** Covers JSON APIs and typical file uploads; raise it via MAX_REQUEST_BODY_SIZE if needed */
const DEFAULT_MAX_BODY_SIZE = "10mb";

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
};

/** "10mb", "512kb", "1048576" (bytes) → bytes */
export const parseSize = (value: string) => {
  const match = value.trim().toLowerCase().match(
    /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/,
  );

  if (!match) {
    throw new Error(
      `Invalid MAX_REQUEST_BODY_SIZE "${value}"! Use bytes or a unit, e.g. "10mb".`,
    );
  }

  return Math.floor(Number(match[1]) * SIZE_UNITS[match[2] ?? "b"]);
};

const payloadTooLarge = () =>
  new Response("Payload Too Large", { status: 413 });

/**
 * Rejects bodies over `max` bytes with a 413. A declared Content-Length is
 * checked up front; chunked bodies are counted while they're read, and reading
 * past the limit throws a 413 Response (which the router returns as-is).
 */
export const limitBody = (req: Request, max: number): Request | Response => {
  if (!req.body) return req;

  const contentLength = req.headers.get("content-length");

  // The server guarantees the body is exactly Content-Length bytes
  if (contentLength !== null) {
    return Number(contentLength) > max ? payloadTooLarge() : req;
  }

  let size = 0;

  return new Request(req, {
    body: req.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength;

          if (size > max) controller.error(payloadTooLarge());
          else controller.enqueue(chunk);
        },
      }),
    ),
  });
};

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

    if (byNamespace.has(namespace)) {
      console.warn(
        `Duplicate route file name "${namespace}.ts" ignored (${path}); route file names must be unique.`,
      );
    } else byNamespace.set(namespace, router);
  }

  const indexRouter = byNamespace.get("index");
  const maxBodySize = parseSize(
    Env.getSync("MAX_REQUEST_BODY_SIZE", true) ?? DEFAULT_MAX_BODY_SIZE,
  );

  return (_req: Request) => {
    const req = limitBody(_req, maxBodySize);

    if (req instanceof Response) return req;

    const url = getURL(req);

    const pathnameParts = url.pathname.split("/").filter(Boolean);
    const [namespace, ...endpointParts] = pathnameParts;

    const matched = namespace ? byNamespace.get(namespace) : undefined;
    const router = matched ?? indexRouter;

    if (!router) return new Response("Not found", { status: 404 });

    const resolvedEndpoint = matched
      ? `/${endpointParts.join("/")}`
      : url.pathname;

    const method = req.method.toLowerCase();
    // HEAD is answered by the GET handler, without a body
    const isHead = method === "head";

    let exec: ReturnType<Router["route"]>;

    try {
      exec = router.route(
        (isHead ? "get" : method) as TMethod,
        resolvedEndpoint,
      );
    } catch (error) {
      // Malformed percent-encoding in the path
      if (error instanceof URIError) {
        return new Response("Bad Request", { status: 400 });
      }

      throw error;
    }

    if (typeof exec !== "function") {
      return new Response("Not found", { status: 404 });
    }

    if (!isHead) return exec(req, hooks);

    return Promise.resolve(exec(req, hooks)).then((res) =>
      new Response(null, res)
    );
  };
};

export const discover = (_req?: Request): Promise<TRouteExecutor> => {
  // A failed startup (e.g. a broken route import) is retried on the next request instead of cached forever
  dispatcher ??= buildDispatcher().catch((error) => {
    dispatcher = undefined;
    throw error;
  });

  return dispatcher;
};
