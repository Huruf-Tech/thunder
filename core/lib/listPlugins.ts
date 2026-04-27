import { join } from "@std/path/join";

export const listPlugins = async () => {
  const pluginsDir = join(Deno.cwd(), "./plugins");
  const plugins = [];

  for await (const entry of Deno.readDir(pluginsDir)) {
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
