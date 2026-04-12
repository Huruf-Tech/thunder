import { parseArgs as parse } from "@std/cli/parse-args";
import { join, normalize, relative } from "@std/path";
import { sh } from "./lib/sh.ts";
import { exists } from "@std/fs/exists";
import { expandGlob } from "@std/fs/expand-glob";
import { generateSDK } from "./generateSDK.ts";
import { readJSONFile, writeJSONFile } from "./lib/utility.ts";
import { IPackageJSON } from "../generators/sdk.ts";

export const generateApp = async (options?: {
  overwrite?: boolean;
}) => {
  const outputPath = join(Deno.cwd(), "./public/app");
  const alreadyExists = await exists(outputPath);

  if (alreadyExists) {
    if (options?.overwrite) {
      await Deno.remove(outputPath, { recursive: true });
    } else {
      throw new Error("App content already exists!");
    }
  }

  const command = [
    "git",
    "clone",
    "--single-branch",
    "https://github.com/Huruf-Tech/thunder-ui",
    outputPath,
  ];

  await sh(command, { cwd: Deno.cwd() });

  const sdkDir = join(Deno.cwd(), "./public/www");

  let sdkPath = (await Array.fromAsync(
    expandGlob("sdk@*", {
      globstar: true,
      root: sdkDir,
      includeDirs: true,
    }),
    (entry) => entry.isDirectory ? entry.path : undefined,
  )).filter(Boolean).pop();

  if (!sdkPath) {
    const version = "0.0.1";

    await generateSDK({ version });

    sdkPath = join(sdkDir, `sdk@${version}`);
  }

  const packageJSONPath = join(outputPath, "package.json");
  const packageJSON = await readJSONFile<IPackageJSON>(packageJSONPath);

  (packageJSON.dependencies ??= {})["thunder-sdk"] = `file:///${
    normalize(relative(outputPath, sdkPath))
  }/npm`;

  await writeJSONFile(packageJSONPath, packageJSON);

  await sh([
    "npm",
    "install",
  ], { cwd: outputPath });

  await sh([
    "npm",
    "run",
    "build",
  ], { cwd: outputPath });
};

if (import.meta.main) {
  const { overwrite } = parse(Deno.args);

  await generateApp({ overwrite });

  console.info("Success");

  Deno.exit();
}
