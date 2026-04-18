import { join } from "@std/path/posix/join";
import { generateSDKContent, TGenerateSDKContentOpts } from "./sdk.ts";
import { ejsRender } from "../utils/textRender.ts";
import { exists } from "@std/fs/exists";
import { toFileUrl } from "@std/path/to-file-url";

export type TGenerateSDKPluginContentOpts = {
  name: string;
  outputPath?: string;
  cwd?: string;
  overwrite?: boolean;
  skipWrite?: boolean;
  generateSDKContentOpts?: TGenerateSDKContentOpts;
};

export const generateSDKPluginContent = async (
  opts: TGenerateSDKPluginContentOpts,
) => {
  const cwd = opts.cwd ?? Deno.cwd();
  const outputPath = join(
    cwd,
    (opts.outputPath ?? "./sdk-plugins/") + opts.name,
  );

  if (!opts?.overwrite && !opts?.skipWrite && await exists(outputPath)) {
    throw new Error("Plugin content already exists!");
  }

  const files: Record<string, string> = {};

  const [
    denoJsonTemplate,
    entryTemplate,
  ] = await Promise.all([
    Deno.readTextFile(
      join(import.meta.dirname, "./templates/sdk-plugin/deno.json.ejs"),
    ),
    Deno.readTextFile(
      join(import.meta.dirname, "./templates/sdk-plugin/entry.ts.ejs"),
    ),
  ]);

  const { outputPath: sdkOutputPath } = await generateSDKContent(
    {
      ...opts.generateSDKContentOpts,
      skipNpmBuild: true,
    },
  )
    .catch(
      () => ({
        outputPath: join(
          cwd,
          `./public/www/sdk@${
            opts.generateSDKContentOpts?.version ?? "0.0.1"
          }/`,
        ),
        files: [],
      }),
    );

  const context = {
    name: opts.name,
    packageName: opts.name + "-plugin",
    sdkEntry: toFileUrl(join(sdkOutputPath, "./index.ts")),
  };

  files["deno.json"] = await ejsRender(denoJsonTemplate, context);
  files["entry.ts"] = await ejsRender(entryTemplate, context);

  if (!opts.skipWrite) {
    await Deno.mkdir(outputPath, { recursive: true });

    await Promise.all(
      Object.entries(files).map(async ([filename, content]) => {
        await Deno.writeTextFile(join(outputPath, filename), content);
      }),
    );
  }

  return {
    outputPath,
    files,
  };
};
