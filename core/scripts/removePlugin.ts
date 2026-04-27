import { parseArgs as parse } from "@std/cli/parse-args";
import { join } from "@std/path";
import { z } from "zod";
import { Input } from "@cliffy/prompt/input";

import { writeJSONFile } from "./lib/utility.ts";
import { denoConfigPath, readDenoConfig } from "../utils/denoConfig.ts";
import { EnvType } from "../utils/env.ts";
import { resolvePluginName } from "./addPlugin.ts";
import { setupPlugin } from "./setupPlugin.ts";

export const removePluginFromImportMap = async (
  name: string,
) => {
  const targetConfig = await readDenoConfig(denoConfigPath, true);

  if (!targetConfig.imports && !targetConfig.scopes) return;

  delete targetConfig.imports?.[`@plugins/${name}/`];
  delete targetConfig.scopes?.[`./plugins/${name}/`];

  await writeJSONFile(denoConfigPath, targetConfig);
};

export const unlinkPlugin = async (name: string, opts?: { cwd?: string }) => {
  const cwd = opts?.cwd ?? Deno.cwd();
  const targetPath = join(cwd, "plugins", name);

  await Deno.remove(targetPath, { recursive: true });

  await removePluginFromImportMap(name);

  await Deno.remove(join(cwd, "./sdk-plugins", name), { recursive: true });
};

export const removePlugin = async (options: {
  name: string;
  clean?: boolean | EnvType[];
  prompt?: boolean;
}) => {
  const Options = await z.object({
    name: z.optional(z.string()),
    clean: z.optional(z.union([z.boolean(), z.array(z.enum(EnvType))])),
  }).parse(options);

  if (options.prompt && !Options.name) {
    Options.name = await Input.prompt({
      message: "Name of the Plugin",
    });
  }

  if (!Options.name) throw new Error("Plugin name is required");

  const resolvedPluginName = resolvePluginName(Options.name);

  await unlinkPlugin(resolvedPluginName);

  if (Options.clean) {
    await setupPlugin({
      name: Options.name,
      envs: Options.clean instanceof Array
        ? Options.clean
        : [EnvType.PRODUCTION],
      clean: true,
      prompt: options.prompt,
    });
  }
};

if (import.meta.main) {
  const { name, n, clean } = parse(Deno.args);

  const resolvedClean = typeof clean === "string"
    ? clean?.split(",").map((env: string) => env.trim())
    : clean;

  await removePlugin({
    name: name ?? n,
    clean: resolvedClean,
    prompt: true,
  });

  console.info("Success");

  Deno.exit();
}
