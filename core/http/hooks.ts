import { expandGlob } from "@std/fs";

export type THook = {
  priority?: number;
  pre?: (scope: string, name: string, req: Request) => void | Promise<void>;
  post?: (
    scope: string,
    name: string,
    req: Request,
    res: Response,
  ) => void | Promise<void>;
};

let hooks: THook[] | undefined;

export const loadHooks = async (path: string) => {
  if (hooks?.length) return hooks;

  hooks = [];

  for await (
    const entry of expandGlob(path, {
      followSymlinks: true,
      canonicalize: true,
      globstar: true,
      root: Deno.cwd(),
    })
  ) {
    if (entry.isFile) {
      const mod = await import(`file:///${entry.path}`);

      if (
        typeof mod.default === "object" &&
        ("pre" in mod.default || "post" in mod.default)
      ) hooks.push(mod.default);
    }
  }

  hooks.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  return hooks;
};
