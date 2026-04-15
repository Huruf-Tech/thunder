import { parseArgs as parse } from "@std/cli/parse-args";
import { z } from "zod";
import { Input } from "@cliffy/prompt/input";
import { Checkbox } from "@cliffy/prompt/checkbox";
import { EnvType } from "../utils/env.ts";
import { join } from "node:path";
import { exists } from "@std/fs/exists";
import { sh } from "./lib/sh.ts";

export const setupPlugin = async (options: {
  name: string;
  envs: Array<EnvType>;
  denoParams?: string[];
  clean?: boolean;
  prompt?: boolean;
}) => {
  const Options = await z.object({
    name: z.optional(z.string()),
    envs: z.optional(z.array(z.enum(EnvType))),
    denoParams: z.optional(z.array(z.string())),
    clean: z.optional(z.boolean()),
  }).parse(options);

  if (options.prompt) {
    if (!Options.name) {
      Options.name = await Input.prompt({
        message: "Name of the Plugin",
      });
    }

    if (!Options.envs) {
      Options.envs = await Checkbox.prompt({
        message: "Select envs",
        options: Object.values(EnvType),
        default: Object.values(EnvType),
      }) as Array<EnvType>;
    }
  }

  if (!Options.name) throw new Error("Plugin name is required");
  if (!Options.envs?.length) {
    throw new Error("At least 1 environment is required");
  }

  const targetScriptPath = join(
    Deno.cwd(),
    "./plugins/",
    Options.name,
    `./scripts/${Options.clean ? "cleanupPlugin" : "setupPlugin"}.ts`,
  );
  const scriptExists = await exists(targetScriptPath);

  if (!scriptExists) {
    console.warn("Lifecycle script not found");

    return;
  }

  for (const env of Options.envs) {
    await sh([
      "deno",
      "run",
      targetScriptPath,
      ...(Options.denoParams ?? ["-A"]),
    ], {
      cwd: Deno.cwd(),
      env: {
        ENV_TYPE: env,
      },
    });
  }
};

if (import.meta.main) {
  const { name, n, envs, clean } = parse(Deno.args);

  await setupPlugin({
    name: name ?? n,
    envs,
    clean,
    prompt: true,
  });

  console.info("Success");

  Deno.exit();
}
