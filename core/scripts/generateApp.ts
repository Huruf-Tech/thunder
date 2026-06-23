// deno-lint-ignore-file ban-ts-comment
import { parseArgs as parse } from "@std/cli/parse-args";
import { dirname, join, relative } from "@std/path";
import { normalize } from "@std/path/posix/normalize";
import { exists, existsSync, expandGlob } from "@std/fs";
import {
  deepMergeUnique,
  printStream,
  readJSONFile,
  writeJSONFile,
} from "./lib/utility.ts";
import { z } from "zod";

import { Confirm } from "@cliffy/prompt";
import { generateSDK } from "@/core/scripts/generateSDK.ts";
import { IPackageJSON } from "@/core/generators/sdk.ts";
import { sh } from "@/core/scripts/lib/sh.ts";

export const generateApp = async (options: {
  template?: string;
  forceSync?: boolean;
  prompt?: boolean;
}) => {
  const Options = z.object({
    forceSync: z.boolean().optional().default(false),
    template: z.string().optional().default("master"),
  }).parse(options);

  const RepositoryPath = "Huruf-Tech/thunder-ui";
  const GitRepoUrl = new URL(RepositoryPath, "https://github.com");
  const TempPath = join(Deno.cwd(), "_temp", RepositoryPath);
  const AppPath = join(Deno.cwd(), "./public/app");
  const Pull = existsSync(TempPath);

  const alreadyExists = await exists(AppPath);

  if (
    alreadyExists &&
    options.prompt &&
    !(await Confirm.prompt({
      message:
        `Updating the app will overwrite any changes made to the core and template files! Are you sure you want to continue?`,
    }))
  ) return;

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

  syncApp: if (Status.success) {
    if (
      !Options.forceSync &&
      Out.find((_) => _.includes("Already up to date"))
    ) break syncApp;

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
          const TargetPath = SourcePath.replace(TempPath, AppPath);

          // Do not replace any file that is not included in this list.
          if (
            existsSync(TargetPath) && [
              /^(\\|\/)?(src(\\|\/)core)(\\|\/)?/,
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

    const sdkDir = join(Deno.cwd(), "./public/www");
    const sdkPaths = (await Array.fromAsync(
      expandGlob("sdk@*", {
        globstar: true,
        root: sdkDir,
        includeDirs: true,
      }),
      (entry) => entry.isDirectory ? entry.path : undefined,
    )).filter(Boolean) as string[];

    let sdkPath = sdkPaths.sort((a, b) =>
      a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    ).pop();

    if (!sdkPath) {
      const version = "0.0.1";

      await generateSDK({ version });

      sdkPath = join(sdkDir, `sdk@${version}`);
    }

    const tempPackageJSONPath = join(TempPath, "package.json");
    const packageJSONPath = join(AppPath, "package.json");

    const tempPackageJSON = await readJSONFile<IPackageJSON>(
      tempPackageJSONPath,
    );

    //@ts-ignore
    delete tempPackageJSON.name;
    //@ts-ignore
    delete tempPackageJSON.version;

    const packageJSON = await readJSONFile<IPackageJSON>(packageJSONPath);

    const updatedPackageJSON = deepMergeUnique(packageJSON, tempPackageJSON);

    (updatedPackageJSON.dependencies ??= {})["thunder-sdk"] = `file:///${
      normalize(relative(AppPath, sdkPath))
    }/npm`;

    await writeJSONFile(packageJSONPath, updatedPackageJSON);

    await sh([
      "npm",
      "install",
    ], { cwd: AppPath });

    await sh([
      "npm",
      "run",
      "build",
    ], { cwd: AppPath });
  } else throw new Error("We were unable to sync app!");
};

if (import.meta.main) {
  const { template, t, forceSync } = parse(Deno.args);

  await generateApp({
    template: template ?? t,
    forceSync,
    prompt: true,
  });

  console.info("App has been synced successfully!");

  Deno.exit();
}
