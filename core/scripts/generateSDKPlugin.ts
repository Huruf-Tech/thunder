import { parseArgs } from "@std/cli/parse-args";
import { generateSDKPluginContent } from "../generators/sdk-plugin.ts";

export const generateSDKPlugin = async (opts?: {
  name?: string;
  version?: string;
  overwrite?: boolean;
}) => {
  const name = opts?.name;

  if (!name) throw new Error("A plugin name is required!");

  await generateSDKPluginContent({
    name,
    cwd: Deno.cwd(),
    generateSDKContentOpts: {
      cwd: Deno.cwd(),
      version: opts?.version,
    },
    overwrite: opts.overwrite,
  });
};

if (import.meta.main) {
  const { name, n, version, v, overwrite } = parseArgs(Deno.args);

  await generateSDKPlugin({
    name: name ?? n,
    version: version ?? v,
    overwrite,
  });

  console.info("SDK plugin has been generated");

  Deno.exit();
}
