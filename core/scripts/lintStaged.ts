import { parseArgs as parse } from "@std/cli/parse-args";
import { sh } from "@/core/scripts/lib/sh.ts";
import { isAbsolute } from "@std/path";

// @deno-types=npm:@types/picomatch
import picomatch from "picomatch";

export const getStagedFiles = async () => {
  const output = await sh([
    "git",
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACM",
  ]);

  return output
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((file) => {
      try {
        return !isAbsolute(file);
      } catch {
        return false;
      }
    });
};

export const getConfigFile = async (
  configPath: string,
): Promise<Record<string, string[] | string>> => {
  const content = await Deno.readTextFile(configPath);

  if (content.trim().startsWith("{")) {
    return JSON.parse(content);
  }

  throw new Error(`Config file not found or invalid: ${configPath}`);
};

export const lintStaged = async (options: {
  configPath?: string;
  allowSymlinks?: boolean;
  prompt?: boolean;
}) => {
  const stagedFiles = await getStagedFiles();
  const config = await getConfigFile(
    options.configPath || "./.lintstagedrc.json",
  );

  for (const [pattern, commands] of Object.entries(config)) {
    const isMatch = picomatch(pattern);

    let matchedFiles = stagedFiles.filter((file) => isMatch(file));

    if (!options.allowSymlinks) {
      matchedFiles = matchedFiles.filter((file) =>
        !Deno.lstatSync(file).isSymlink
      );
    }

    if (matchedFiles.length > 0) {
      console.log(`Running commands for pattern: ${pattern}`);

      for (const command of Array.isArray(commands) ? commands : [commands]) {
        console.log(`-- executing: ${command}`);

        await sh([...command.split(" "), ...matchedFiles]);
      }
    }
  }
};

if (import.meta.main) {
  const { config, allowSymlinks } = parse(Deno.args);

  await lintStaged({
    prompt: true,
    configPath: config,
    allowSymlinks,
  });

  console.info("Success");

  Deno.exit();
}
