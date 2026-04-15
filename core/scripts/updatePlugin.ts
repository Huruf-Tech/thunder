import { parseArgs as parse } from "@std/cli/parse-args";
import { z } from "zod";
import { Input } from "@cliffy/prompt/input";

import { addPlugin } from "./addPlugin.ts";
import { removePlugin } from "./removePlugin.ts";
import { EnvType } from "../utils/env.ts";

export const updatePlugin = async (options: {
  name: string;
  setup?: boolean | EnvType[];
  prompt?: boolean;
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

  await removePlugin({
    name: Options.name,
    clean: Options.setup instanceof Array
      ? Options.setup
      : [EnvType.PRODUCTION],
    prompt: options.prompt,
  });
  await addPlugin({
    name: Options.name,
    setup: Options.setup instanceof Array
      ? Options.setup
      : [EnvType.PRODUCTION],
    prompt: options.prompt,
  });
};

if (import.meta.main) {
  const { name, n, setup } = parse(Deno.args);

  const resolvedSetup = setup instanceof Array
    ? setup
    : setup?.split(",").map((env: string) => env.trim());

  await updatePlugin({
    name: name ?? n,
    setup: resolvedSetup,
    prompt: true,
  });

  console.info("Success");

  Deno.exit();
}
