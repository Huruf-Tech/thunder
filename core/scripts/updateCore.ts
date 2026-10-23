import { parseArgs as parse } from "@std/cli/parse-args";
import { dirname, join, toFileUrl } from "@std/path";
import { existsSync, expandGlob } from "@std/fs";
import { printStream } from "./lib/utility.ts";
import { z } from "zod";

import { mergeDenoConfig as _mergeDenoConfig } from "@/core/lib/mergeDenoConfig.ts";
import { Confirm, Select } from "@cliffy/prompt";

export const getDenoConfig = async () => {
  const MainConfigPath = join(Deno.cwd(), "deno.json");

  return (
    await import(toFileUrl(MainConfigPath).href, {
      with: { type: "json" },
    })
  ).default;
};

/** Dotted paths whose values differ between two configs (e.g. "imports.zod") */
const diffKeys = (a: unknown, b: unknown, path = ""): string[] => {
  if (
    a && b && typeof a === "object" && typeof b === "object" &&
    !Array.isArray(a) && !Array.isArray(b)
  ) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

    return [...keys].flatMap((key) =>
      diffKeys(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
      )
    );
  }

  return JSON.stringify(a) === JSON.stringify(b) ? [] : [path];
};

export const mergeDenoConfig = async (
  dir: string,
  opts?: { prompt?: boolean },
) => {
  const TempConfigPath = join(dir, "deno.json");

  const TempConfig = (
    await import(toFileUrl(TempConfigPath).href, {
      with: { type: "json" },
    })
  ).default;

  const MainConfig = await getDenoConfig();
  const MergedConfig = _mergeDenoConfig(MainConfig, TempConfig);
  const changes = diffKeys(MainConfig, MergedConfig);

  if (!changes.length) return;

  if (
    opts?.prompt &&
    !(await Confirm.prompt({
      message: `Update deno.json? Changes:\n  ${changes.join("\n  ")}\n`,
    }))
  ) return;

  await Deno.writeTextFile(
    join(Deno.cwd(), "deno.json"),
    JSON.stringify(MergedConfig, undefined, 2),
  );
};

const isSameFile = async (a: string, b: string) => {
  const [x, y] = await Promise.all([Deno.readFile(a), Deno.readFile(b)]);

  return x.length === y.length && x.every((byte, i) => byte === y[i]);
};

/**
 * Decides whether a template file may replace an existing project file.
 * Files under core/ are always replaced (confirmed once up front); any other
 * existing file is only replaced after asking (unless prompting is off).
 */
export const createOverwriteGuard = (prompt?: boolean) => {
  let remembered: boolean | undefined;

  return async (relativePath: string, source: string, target: string) => {
    if (!existsSync(target)) return true;
    if (await isSameFile(source, target)) return false;
    if (/^(\\|\/)?core(\\|\/)/.test(relativePath)) return true;
    if (!prompt) return true;
    if (remembered !== undefined) return remembered;

    const answer = await Select.prompt({
      message: `"${relativePath}" differs from the template. Overwrite it?`,
      options: [
        { name: "Overwrite", value: "yes" },
        { name: "Skip (keep my file)", value: "no" },
        { name: "Overwrite all remaining", value: "all" },
        { name: "Skip all remaining", value: "none" },
      ],
    });

    if (answer === "all") remembered = true;
    if (answer === "none") remembered = false;

    return answer === "yes" || answer === "all";
  };
};

export const updateCore = async (options: {
  template?: string;
  forceSync?: boolean;
  prompt?: boolean;
}) => {
  const Options = z.object({
    forceSync: z.boolean().optional().default(false),
    template: z.string().optional()
      .default((await getDenoConfig()).template ?? "main"),
  }).parse(options);

  if (
    options.prompt &&
    !(await Confirm.prompt({
      message:
        `Updating the core will overwrite any changes made to the core and template files! Are you sure you want to continue?`,
    }))
  ) return;

  const RepositoryPath = "Huruf-Tech/thunder";
  const GitRepoUrl = new URL(RepositoryPath, "https://github.com");
  const TempPath = join(Deno.cwd(), "_temp", RepositoryPath);
  const Pull = existsSync(TempPath);

  const Command = new Deno.Command("git", {
    args: Pull ? ["pull", "origin", Options.template, "--progress"] : [
      "clone",
      "--single-branch",
      "--branch",
      Options.template,
      GitRepoUrl.toString(),
      TempPath,
      "--progress",
    ],
    cwd: Pull ? TempPath : undefined,
    stdout: "piped",
    stderr: "piped",
  });

  const Process = Command.spawn();

  const [Out] = await Promise.all([
    printStream(Process.stdout),
    printStream(Process.stderr),
  ]);

  const Status = await Process.status;

  const shouldOverwrite = createOverwriteGuard(options.prompt);

  updateCore: if (Status.success) {
    if (
      !Options.forceSync &&
      Out.find((_) => _.includes("Already up to date"))
    ) break updateCore;

    // Create Files
    for (
      const Glob of ["**/**/*"].map((pattern) =>
        expandGlob(pattern, {
          root: TempPath,
          globstar: true,
        })
      )
    ) {
      for await (const Entry of Glob) {
        // Do not include .git folder
        if (
          !Entry.isDirectory &&
          !/^(\\|\/)?\.git(\\|\/|$)/.test(Entry.path.replace(TempPath, ""))
        ) {
          const SourcePath = Entry.path;
          const TargetPath = SourcePath.replace(TempPath, Deno.cwd());

          // Do not replace any file that is not included in this list.
          if (
            existsSync(TargetPath) && [
              /^(\\|\/)?(core)(\\|\/)/,
              /^(\\|\/)?(docs)(\\|\/)/,
              /^(\\|\/)?(tests)(\\|\/)/,
              /^(\\|\/)?(serve\.base\.ts)$/,
              /^(\\|\/)?(llms\.txt)$/,
              /^(\\|\/)?(llms-full\.txt)$/,
              /^(\\|\/)?(CLAUDE\.md)$/,
            ].reduce(
              (continues, expect) =>
                continues &&
                !expect.test(Entry.path.replace(TempPath, "")),
              true,
            )
          ) continue;

          if (
            !await shouldOverwrite(
              Entry.path.replace(TempPath, ""),
              SourcePath,
              TargetPath,
            )
          ) continue;

          const TargetDirectory = dirname(TargetPath);

          await Deno.mkdir(TargetDirectory, { recursive: true }).catch(() => {
            // Do nothing...
          });

          await Deno.copyFile(SourcePath, TargetPath);
        }
      }
    }

    // Code snippets and the framework README (copied under a different name)
    for (
      const [source, target] of [
        [".vscode/thunder.code-snippets", ".vscode/thunder.code-snippets"],
        ["README.md", "thunder.README.md"],
      ]
    ) {
      const SourcePath = join(TempPath, source);
      const TargetPath = join(Deno.cwd(), target);

      if (await shouldOverwrite(target, SourcePath, TargetPath)) {
        await Deno.mkdir(dirname(TargetPath), { recursive: true });
        await Deno.copyFile(SourcePath, TargetPath);
      }
    }

    await mergeDenoConfig(TempPath, { prompt: options.prompt });
  } else throw new Error("We were unable to update the core!");
};

if (import.meta.main) {
  const { template, t, forceSync } = parse(Deno.args);

  await updateCore({
    template: template ?? t,
    forceSync,
    prompt: true,
  });

  console.info("Core has been updated successfully!");

  Deno.exit();
}
