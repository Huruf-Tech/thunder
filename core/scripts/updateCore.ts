import { parseArgs as parse } from "@std/cli/parse-args";
import { dirname, join } from "@std/path";
import { deepMerge } from "@std/collections";
import { existsSync, expandGlob } from "@std/fs";
import { printStream } from "./lib/utility.ts";
import { z } from "zod";

import { Confirm } from "@cliffy/prompt";

export const getDenoConfig = async () => {
  const MainConfigPath = join(Deno.cwd(), "deno.json");

  return (
    await import(`file:///${MainConfigPath}`, {
      with: { type: "json" },
    })
  ).default;
};

export const mergeDenoConfig = async (dir: string) => {
  const TempConfigPath = join(dir, "deno.json");

  const TempConfig = (
    await import(`file:///${TempConfigPath}`, {
      with: { type: "json" },
    })
  ).default;

  const MainConfig = await getDenoConfig();

  const ResultConfig = deepMerge(MainConfig, TempConfig);

  delete ResultConfig.id;
  delete ResultConfig.version;
  delete ResultConfig.title;
  delete ResultConfig.description;
  delete ResultConfig.homepage;
  delete ResultConfig.icon;
  delete ResultConfig.author;
  delete ResultConfig.keywords;
  delete ResultConfig.donate;

  await Deno.writeTextFile(
    join(Deno.cwd(), "deno.json"),
    JSON.stringify(
      {
        ...MainConfig,
        ...ResultConfig,
      },
      undefined,
      2,
    ),
  );
};

export const updateCore = async (options: {
  template?: string;
  forceSync?: boolean;
  prompt?: boolean;
}) => {
  const Options = z.object({
    forceSync: z.boolean().optional().default(false),
    template: z.string().optional()
      .default((await getDenoConfig()).template ?? "master"),
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
          !/^(\\|\/)?(\.git)(\\|\/)?/.test(Entry.path.replace(TempPath, ""))
        ) {
          const SourcePath = Entry.path;
          const TargetPath = SourcePath.replace(TempPath, Deno.cwd());

          // Do not replace any file that is not included in this list.
          if (
            existsSync(TargetPath) && [
              /^(\\|\/)?(core)(\\|\/)?/,
              /^(\\|\/)?(docs)(\\|\/)?/,
              /^(\\|\/)?(templates)(\\|\/)?/,
              /^(\\|\/)?(tests)(\\|\/)?/,
              /^(\\|\/)?(serve.ts)/,
              /^(\\|\/)?(base.d.ts)/,
            ].reduce(
              (continues, expect) =>
                continues &&
                !expect.test(Entry.path.replace(TempPath, "")),
              true,
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

    // Update Code Snippets
    await Deno.copyFile(
      join(TempPath, ".vscode/thunder.code-snippets"),
      join(Deno.cwd(), ".vscode/new.thunder.code-snippets"),
    );

    // Update Docs File
    await Deno.copyFile(
      join(TempPath, "README.md"),
      join(Deno.cwd(), "new.README.md"),
    );

    await mergeDenoConfig(TempPath);
  } else throw new Error("We were unable to update the core!");

  console.info("Core has been updated successfully!");
};

if (import.meta.main) {
  const { template, t, forceSync } = parse(Deno.args);

  await updateCore({
    template: template ?? t,
    forceSync,
    prompt: true,
  });

  Deno.exit();
}
