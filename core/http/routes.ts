import { expandGlob } from "@std/fs/expand-glob";
import { basename } from "@std/path/basename";
import { join } from "@std/path/join";
import { toFileUrl } from "@std/path/to-file-url";
import { memoize } from "@/core/utils/cache.ts";
import { listPlugins } from "@/core/lib/listPlugins.ts";
import { Router } from "@/core/http/router.ts";

export const findRouter = memoize(async (
  globPattern: string,
  target: string,
) => {
  const routesDir = "./routes";
  const routesRoot = join(Deno.cwd(), routesDir);

  for await (
    const entry of expandGlob(globPattern, {
      includeDirs: false,
      globstar: true,
      root: routesRoot,
    })
  ) {
    if (target === basename(entry.path)) {
      const module = await import(toFileUrl(entry.path).href);

      if (typeof module.default?.route === "function") {
        return {
          router: module.default as Router,
        };
      }
    }
  }

  const plugins = await listPlugins();

  for (const plugin of plugins) {
    for await (
      const entry of expandGlob(globPattern, {
        includeDirs: false,
        globstar: true,
        root: join(plugin, routesDir),
      })
    ) {
      if (target === basename(entry.path)) {
        const module = await import(toFileUrl(entry.path).href);

        if (typeof module.default?.route === "function") {
          return {
            router: module.default as Router,
          };
        }
      }
    }
  }

  return {
    fallback: true,
    router: (await import(toFileUrl(join(routesRoot, "index.ts")).href))
      .default as Router,
  };
}, (globPattern, target) => `${globPattern}\u0000${target}`);

export const loadRouters = memoize(async (globPattern: string) => {
  const routesDir = "./routes";
  const routesRoot = join(Deno.cwd(), routesDir);

  const routers: Array<{
    router: Router;
    path: string;
  }> = [];

  for await (
    const entry of expandGlob(globPattern, {
      includeDirs: false,
      globstar: true,
      root: routesRoot,
    })
  ) {
    const module = await import(toFileUrl(entry.path).href);

    if (typeof module.default?.route === "function") {
      routers.push({
        router: module.default as Router,
        path: entry.path,
      });
    }
  }

  const plugins = await listPlugins();

  for (const plugin of plugins) {
    for await (
      const entry of expandGlob(globPattern, {
        includeDirs: false,
        globstar: true,
        root: join(plugin, routesDir),
      })
    ) {
      const module = await import(toFileUrl(entry.path).href);

      if (typeof module.default?.route === "function") {
        routers.push({
          router: module.default as Router,
          path: entry.path,
        });
      }
    }
  }

  return routers;
}, (globPattern) => globPattern);
