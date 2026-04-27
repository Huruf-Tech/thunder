import { expandGlob } from "@std/fs/expand-glob";
import { basename } from "@std/path/basename";
import { join } from "@std/path/join";
import { toFileUrl } from "@std/path/to-file-url";
import { cache } from "@/core/utils/cache.ts";
import { listPlugins } from "@/core/lib/listPlugins.ts";

export const loadRoutes = cache(async (
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
      return {
        module: await import(toFileUrl(entry.path).href),
      };
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
        return {
          module: await import(toFileUrl(entry.path).href),
        };
      }
    }
  }

  return {
    fallback: true,
    module: await import(toFileUrl(join(routesRoot, "index.ts")).href),
  };
}, Infinity);
