import { join } from "@std/path/join";

export const listPlugins = async () => {
  const pluginsDir = join(Deno.cwd(), "./plugins");
  const plugins = [];

  // No plugins/ folder simply means no plugins
  const entries = await Array.fromAsync(Deno.readDir(pluginsDir)).catch(
    (error) => {
      if (error instanceof Deno.errors.NotFound) return [];
      throw error;
    },
  );

  for (const entry of entries) {
    if (entry.isDirectory) {
      for await (
        const pluginEntry of Deno.readDir(join(pluginsDir, entry.name))
      ) {
        if (pluginEntry.isDirectory) {
          plugins.push(join(pluginsDir, entry.name, pluginEntry.name));
        }
      }
    }
  }

  return plugins;
};
