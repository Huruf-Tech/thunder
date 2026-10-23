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

const ignoreNotFound = (error: unknown) => {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
};

export const unlinkPlugin = async (name: string, opts?: { cwd?: string }) => {
  const cwd = opts?.cwd ?? Deno.cwd();
  const targetPath = join(cwd, "plugins", name);

  await Deno.remove(targetPath, { recursive: true }).catch(ignoreNotFound);

  await removePluginFromImportMap(name);

  await Deno.remove(join(cwd, "./sdk-plugins", name), { recursive: true })
    .catch(ignoreNotFound);
};

export const removePlugin = async (options: {
  name: string;
  clean?: boolean | EnvType[];
  prompt?: boolean;
  /** Seconds before the script is killed. Default: no timeout (scripts may run long migrations). */
  timeout?: number;
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

  // The cleanup script lives inside the plugin folder, so it must run before unlinking
  if (Options.clean) {
    await setupPlugin({
      name: resolvedPluginName,
      envs: Options.clean instanceof Array
        ? Options.clean
        : [EnvType.PRODUCTION],
      clean: true,
      prompt: options.prompt,
      timeout: options.timeout,
    });
  }

  await unlinkPlugin(resolvedPluginName);
};

if (import.meta.main) {
  const { name, n, clean, timeout } = parse(Deno.args);

  const resolvedClean = typeof clean === "string"
    ? clean?.split(",").map((env: string) => env.trim())
    : clean;

  await removePlugin({
    name: name ?? n,
    clean: resolvedClean,
    timeout,
    prompt: true,
  });

  console.info("Success");

  Deno.exit();
}
