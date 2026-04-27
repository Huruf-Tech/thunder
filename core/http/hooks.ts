import { expandGlob } from "@std/fs/expand-glob";
import { toFileUrl } from "@std/path/to-file-url";
import { cache } from "@/core/utils/cache.ts";
import { listPlugins } from "@/core/lib/listPlugins.ts";
import { join } from "@std/path/join";

export type THook = {
  priority?: number;
  pre?: (
    ctx: {
      req: Request;
      scope: string;
      name?: string;
    },
  ) => Response | void | Promise<Response | void>;
  post?: (
    ctx: {
      req: Request;
      res: Response;
      scope: string;
      name?: string;
    },
  ) => Response | void | Promise<Response | void>;
};

const importHook = async (path: string) => {
  const mod = await import(toFileUrl(path).href);
  const d = mod.default;

  if (
    d != null &&
    typeof d === "object" &&
    ("pre" in d || "post" in d)
  ) return d as THook;

  throw new Error(`Invalid hook encountered at: ${path}`);
};

export const loadHooks = cache(async (
  globPattern: string,
): Promise<THook[]> => {
  const hooksDir = "./hooks";
  const hooksRoot = join(Deno.cwd(), hooksDir);
  const hooks: THook[] = [];

  for await (
    const entry of expandGlob(globPattern, {
      includeDirs: false,
      globstar: true,
      root: hooksRoot,
    })
  ) hooks.push(await importHook(entry.path));

  const plugins = await listPlugins();

  for (const plugin of plugins) {
    for await (
      const entry of expandGlob(globPattern, {
        includeDirs: false,
        globstar: true,
        root: join(plugin, hooksDir),
      })
    ) hooks.push(await importHook(entry.path));
  }

  hooks.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  return hooks;
}, Infinity);
