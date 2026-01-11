import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";

const pluginDir = "./plugins/";
const pluginNamespaces = readdirSync(pluginDir);

export const schemas: string[] = [];

for (const namespace of pluginNamespaces) {
  const pluginProviderDir = join(pluginDir, namespace);
  const plugins = readdirSync(join(pluginDir, namespace));

  for (const plugin of plugins) {
    const schemaPath = join(
      pluginProviderDir,
      plugin,
      "db",
    );

    if (existsSync(schemaPath)) {
      schemas.push(schemaPath.replaceAll("\\", "/"));
    }
  }
}
