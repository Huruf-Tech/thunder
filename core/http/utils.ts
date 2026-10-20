import { exists } from "@std/fs/exists";
import { parseQueryParams } from "@/core/utils/parseQueryParams.ts";
import { join } from "@std/path/join";
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
    if (await exists(root)) existingRoots.push(root);
  }

  if (filePath) {
    for (const root of existingRoots) {
      const res = await serveFile(req, join(root, filePath));
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
  const base64Credentials = authorization?.replace(/^Basic\s+/i, "");

  if (!base64Credentials) return null;

  const credentials = atob(base64Credentials);
  const [username, password] = credentials.split(":");

  return { username, password } as const;
};
