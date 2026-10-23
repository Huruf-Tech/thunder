import { exists } from "@std/fs/exists";
import { parseQueryParams } from "@/core/utils/parseQueryParams.ts";
import { join } from "@std/path/join";
import { resolve } from "@std/path/resolve";
import { SEPARATOR } from "@std/path/constants";
import { serveFile } from "@std/http/file-server";
import { indexFileCache, paramsMap } from "./constants.ts";
import type { IParseOptions } from "qs";

const urlCache = new WeakMap<Request, URL>();

export const getURL = (req: Request) => {
  let url = urlCache.get(req);

  if (!url) {
    url = new URL(req.url);
    urlCache.set(req, url);
  }

  return url;
};

export const paramsAsJson = <T extends Record<string, string>>(
  req: Request,
): T => {
  return (paramsMap.get(req) ?? {}) as T;
};

export const queryAsJson = (req: Request, opts?: IParseOptions) => {
  const url = getURL(req);

  return parseQueryParams(url.search, opts);
};

export const bodyAsJson = async (req: Request) => {
  const raw = await req.text();

  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
};

const getIndexFile = async (root: string) => {
  let IndexFile = indexFileCache.get(root);

  if (!IndexFile) {
    IndexFile = "index.html";

    if (!await exists(join(root, IndexFile))) {
      for await (const item of Deno.readDir(root)) {
        if (!item.isDirectory && /^index.*/.test(item.name)) {
          IndexFile = item.name;
          break;
        }
      }
    }

    indexFileCache.set(root, IndexFile);
  }

  return IndexFile;
};

// Asset roots don't disappear at runtime; caching hits saves a stat per root per request.
// Misses are re-checked, so a root created later (e.g. a generated app) is picked up.
const knownRoots = new Set<string>();

const rootExists = async (root: string) => {
  if (knownRoots.has(root)) return true;
  if (!await exists(root)) return false;

  knownRoots.add(root);

  return true;
};

/**
 * Serves `filePath` from the first root that has it. Falls back to the
 * index file of the first root that has one (SPA routing).
 */
export const serveAssets = async (
  req: Request,
  roots: string | string[],
  filePath?: string,
) => {
  const existingRoots: string[] = [];

  for (const root of [roots].flat()) {
    if (await rootExists(root)) existingRoots.push(root);
  }

  // A NUL byte can't be in a real path (and makes the fs APIs throw)
  if (filePath && !filePath.includes("\0")) {
    for (const root of existingRoots) {
      const path = resolve(root, filePath);

      // Path params are decoded, so `..%2F` could otherwise escape the root (e.g. to .env)
      if (!path.startsWith(resolve(root) + SEPARATOR)) continue;

      const res = await serveFile(req, path);
      if (res.status !== 404) return res;
    }
  }

  for (const root of existingRoots) {
    const res = await serveFile(req, join(root, await getIndexFile(root)));
    if (res.status !== 404) return res;
  }

  return new Response("Not found", { status: 404 });
};

export const parseBasicAuth = (req: Request) => {
  const authorization = req.headers?.get("authorization");
  const base64Credentials = authorization?.match(/^Basic\s+(.+)$/i)?.[1];

  if (!base64Credentials) return null;

  let credentials: string;

  try {
    credentials = atob(base64Credentials);
  } catch {
    return null;
  }

  // The password may itself contain ":" (RFC 7617)
  const separator = credentials.indexOf(":");

  if (separator === -1) return null;

  return {
    username: credentials.slice(0, separator),
    password: credentials.slice(separator + 1),
  } as const;
};
