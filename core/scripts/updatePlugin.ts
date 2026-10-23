import { parseArgs as parse } from "@std/cli/parse-args";
import { dirname, join } from "@std/path";
import { exists } from "@std/fs/exists";
import { z } from "zod";
import { Input } from "@cliffy/prompt/input";

import { addPlugin, resolvePluginName } from "./addPlugin.ts";
import { removePlugin } from "./removePlugin.ts";
import { setupPlugin } from "./setupPlugin.ts";
import { symlink } from "./lib/utility.ts";
import { denoConfigPath } from "../utils/denoConfig.ts";
import { EnvType } from "../utils/env.ts";

export const updatePlugin = async (options: {
  name: string;
  setup?: boolean | EnvType[];
  prompt?: boolean;
  /** Seconds before the script is killed. Default: no timeout (scripts may run long migrations). */
  timeout?: number;
}) => {
  const Options = await z.object({
    name: z.optional(z.string()),
    setup: z.optional(z.union([z.boolean(), z.array(z.enum(EnvType))])),
  }).parse(options);

  if (options.prompt && !Options.name) {
    Options.name = await Input.prompt({
      message: "Name of the Plugin",
    });
  }

  if (!Options.name) throw new Error("Plugin name is required");

  const name = resolvePluginName(Options.name);
  const pluginPath = join(Deno.cwd(), "plugins", name);
  const backupPath = join(Deno.cwd(), "_temp", ".backup", name);
  const denoConfigBackup = await Deno.readTextFile(denoConfigPath);

  // Move the current version aside instead of deleting it, so a failed fetch/copy can be undone
  await Deno.remove(backupPath, { recursive: true }).catch(() => {});
  await Deno.mkdir(dirname(backupPath), { recursive: true });

  const hadPlugin = await exists(pluginPath);

  if (hadPlugin) await Deno.rename(pluginPath, backupPath);

  try {
    await removePlugin({ name });
    await addPlugin({ name });
  } catch (error) {
    console.error("Plugin update failed, restoring the previous version...");

    await Deno.remove(pluginPath, { recursive: true }).catch(() => {});

    if (hadPlugin) {
      await Deno.rename(backupPath, pluginPath);

      if (await exists(join(pluginPath, "sdk-plugins"))) {
        await symlink(
          join(pluginPath, "sdk-plugins"),
          join(Deno.cwd(), "sdk-plugins", name),
        );
      }
    }

    await Deno.writeTextFile(denoConfigPath, denoConfigBackup);

    throw error;
  }

  await Deno.remove(backupPath, { recursive: true }).catch(() => {});

  // Setup (migrations, indexes) runs only once the new code is in place
  if (Options.setup) {
    await setupPlugin({
      name,
      envs: Options.setup instanceof Array
        ? Options.setup
        : [EnvType.PRODUCTION],
      prompt: options.prompt,
      timeout: options.timeout,
    });
  }
};

if (import.meta.main) {
  const { name, n, setup, timeout } = parse(Deno.args);

  const resolvedSetup = typeof setup === "string"
    ? setup?.split(",").map((env: string) => env.trim())
    : setup;

  await updatePlugin({
    name: name ?? n,
    setup: resolvedSetup,
    timeout,
    prompt: true,
  });

  console.info("Success");

  Deno.exit();
}
