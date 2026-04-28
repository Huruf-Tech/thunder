import { expandGlob } from "@std/fs/expand-glob";
import { join } from "@std/path/posix/join";
import { dirname } from "@std/path/dirname";
import { basename } from "@std/path/basename";
import { relative } from "@std/path/relative";
import { exists } from "@std/fs/exists";
import z from "zod";
import {
  createAuxiliaryTypeStore,
  createTypeAlias,
  OptionalTypeOverrideFunction,
  printNode,
  zodToTs,
} from "@oridune/zod-to-ts";
import { Router, THandlerIOShapes, TMethod } from "../http/router.ts";
import { ejsRender } from "../utils/textRender.ts";
import { writeTextFile } from "../scripts/lib/utility.ts";
import { denoConfig } from "../utils/denoConfig.ts";
import { sh } from "../scripts/lib/sh.ts";
import { loadRouters } from "@/core/http/routes.ts";

export type TSDKMethodDetails = {
  method: TMethod;
  endpoint: string;

  shapes: THandlerIOShapes | undefined;
  types: {
    headers?: string;
    params?: string;
    query?: string;
    body?: string;
    return?: string;
  };
};

const globalTypesMap = new Map<string, string>();

export const routerToMethods = (router: Router, opts?: {
  skipBuildTypes?: boolean;
}) => {
  const auxiliaryTypeStore = createAuxiliaryTypeStore();
  const methods: Record<string, TSDKMethodDetails> = {};

  for (const [_, { fullPath, methods: httpMethods }] of router["registry"]) {
    for (const [httpMethod, { name, handler }] of Object.entries(httpMethods)) {
      let shapes: THandlerIOShapes | undefined;

      if (typeof handler === "object" && typeof handler.shape === "function") {
        shapes = handler.shape();
      }

      methods[name] = {
        method: httpMethod as TMethod,
        endpoint: fullPath,
        shapes,
        types: {},
      };

      const skipBody = !["post", "patch", "put"].includes(httpMethod);

      if (shapes && !opts?.skipBuildTypes) {
        for (const [_key] of Object.entries(shapes)) {
          const key = _key as keyof THandlerIOShapes;
          const shape = shapes[key];

          if (!shape) continue;
          if (skipBody && key === "body") continue;

          const overrideFunction: (
            root?: z.z.core.$ZodType,
          ) => OptionalTypeOverrideFunction = (root) =>
          (
            schema,
            ts,
          ) => {
            if ("meta" in schema && typeof schema.meta === "function") {
              const meta = schema.meta() as Record<string, unknown> | undefined;

              if (schema instanceof z.ZodCustom) {
                let type = "unknown";

                if (typeof meta?.tsType === "string") {
                  type = meta.tsType;
                }

                return ts.factory.createTypeReferenceNode(
                  ts.factory.createIdentifier(type),
                );
              }

              if (
                typeof meta?.tsLabel === "string" &&
                root !== schema
              ) {
                if (!globalTypesMap.has(meta.tsLabel)) {
                  const { node } = zodToTs(schema, {
                    auxiliaryTypeStore,
                    overrideFunction: overrideFunction(schema),
                    io: key === "return" ? "output" : "input",
                  });

                  const typeAlias = createTypeAlias(node, meta.tsLabel);

                  globalTypesMap.set(meta.tsLabel, printNode(typeAlias));
                }

                return ts.factory.createTypeReferenceNode(
                  ts.factory.createIdentifier(meta.tsLabel),
                );
              }
            }
          };

          const { node } = zodToTs(shape, {
            auxiliaryTypeStore,
            overrideFunction: overrideFunction(),
            io: key === "return" ? "output" : "input",
          });

          const typeAlias = createTypeAlias(node, `${name}$${key}`);

          methods[name].types[key] = printNode(typeAlias);
        }
      }
    }
  }

  return methods;
};

export type TSDKModuleDetails = {
  name: string;
  metadata?: Record<string, unknown>;
  methods: Record<string, TSDKMethodDetails>;
};

export const generateModules = async (
  opts?: {
    cwd?: string;
    skipBuildTypes?: boolean;
  },
) => {
  const modules: Record<string, TSDKModuleDetails> = {};

  const routers = await loadRouters("./**/*.ts");

  for (const router of routers) {
    if (modules[router.name]) {
      console.warn(`Duplicate router detected ${router.name}`);
    }

    const methods = routerToMethods(router, opts);

    modules[`${router.name}.ts`] = {
      name: router.name,
      metadata: router.metadata,
      methods,
    };
  }

  return { modules, globalTypesMap };
};

export interface IPackageJSON {
  name: string;
  version: string;
  private?: boolean;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;

  [K: string]: unknown;
}

export const createPackageJSON = (
  opts?: Partial<IPackageJSON>,
): IPackageJSON => ({
  name: opts?.name ?? "thunder-sdk",
  version: opts?.version ?? "0.0.0",
  private: true,
  main: "./dist/index.js",
  scripts: {
    build: "tsc",
  },
  author: denoConfig.name,
  license: "MIT",
  homepage: denoConfig.homepage,
  ...opts,
});

export const generateNpmModule = async (opts: {
  version: string;
  sdkDir: string;
}) => {
  const script = "./scripts/buildNpm.ts";

  const scriptPath = join(opts.sdkDir, script);
  const modulePath = join(opts.sdkDir, "npm");

  const packageJSON = createPackageJSON({
    version: opts.version,
    private: undefined,
    main: undefined,
    scripts: undefined,
  });

  await writeTextFile(
    scriptPath,
    `
    import { build, emptyDir } from "jsr:@deno/dnt";

    await emptyDir("./npm");

    await build({
      entryPoints: ["./index.ts"],
      outDir: "./npm",
      shims: {
        // see JS docs for overview and more options
        deno: true,
      },
      package: ${JSON.stringify(packageJSON)},
    });
    `,
  );

  await sh(["deno", "run", "-A", script], { cwd: opts.sdkDir });
  await sh(["npm", "pack"], { cwd: modulePath });

  const CurrentTarballPath = join(
    modulePath,
    `${packageJSON.name}-${packageJSON.version}.tgz`,
  );
  const NewTarballPath = join(opts.sdkDir, "package.tgz");

  await Deno.rename(CurrentTarballPath, NewTarballPath);
};

export const syncPluginContent = async (opts: {
  sdkDir: string;
  pluginDir: string;
}) => {
  const pluginFiles: Record<string, string> = {};
  const pluginNames: string[] = [];

  for await (
    const entry of expandGlob(
      "./**/deno.json",
      {
        root: opts.pluginDir,
        globstar: true,
        followSymlinks: true,
        canonicalize: true,
      },
    )
  ) {
    const pluginDir = dirname(entry.path);
    const pluginName = basename(pluginDir);

    pluginNames.push(pluginName);

    for await (
      const subEntry of expandGlob("**/**/*", {
        root: pluginDir,
        globstar: true,
        followSymlinks: true,
        canonicalize: true,
      })
    ) {
      if (
        !subEntry.isDirectory &&
        // Do not copy these files and folders
        [
          ".git",
          ".vscode",
          "node_modules",
        ].reduce(
          (allow, ignore) =>
            allow &&
            !subEntry.path.includes(ignore),
          true,
        )
      ) {
        const content = await Deno.readTextFile(subEntry.path);
        const filePath = `plugins/${pluginName}/${
          relative(pluginDir, subEntry.path)
        }`;

        pluginFiles[filePath] = content.replace(
          /from\s*"thunder-sdk"/g,
          `from "${
            relative(
              dirname(join(opts.sdkDir, filePath)),
              join(opts.sdkDir, "index.ts"),
            ).replace(/\\/g, "/")
          }"`,
        );
      }
    }
  }

  return {
    pluginNames,
    pluginFiles,
  };
};

export type TGenerateSDKContentOpts = {
  name?: string;
  version?: string;
  routesDir?: string;
  pluginDir?: string;
  outputDir?: string;
  cwd?: string;
  overwrite?: boolean;
  skipWrite?: boolean;
  skipNpmBuild?: boolean;
};

export const generateSDKContent = async (
  opts?: TGenerateSDKContentOpts,
) => {
  const cwd = opts?.cwd ?? Deno.cwd();
  const name = opts?.name ?? "thunder-sdk";
  const version = opts?.version ?? "0.0.1";
  const outputPath = join(
    cwd,
    (opts?.outputDir ?? "./public/www/") + `sdk@${version}`,
  );

  if (!opts?.overwrite && !opts?.skipWrite && await exists(outputPath)) {
    throw new Error("SDK content already exists!");
  }

  const files: Record<string, string> = {};

  const { modules, globalTypesMap } = await generateModules(
    { cwd },
  );

  const [
    baseTemplate,
    indexTemplate,
    typesTemplate,
    denoJsonTemplate,
    moduleTemplate,
  ] = await Promise.all([
    Deno.readTextFile(
      join(import.meta.dirname, "./templates/sdk/base.ts.ejs"),
    ),
    Deno.readTextFile(
      join(import.meta.dirname, "./templates/sdk/index.ts.ejs"),
    ),
    Deno.readTextFile(
      join(import.meta.dirname, "./templates/sdk/types.ts.ejs"),
    ),
    Deno.readTextFile(
      join(import.meta.dirname, "./templates/sdk/deno.json.ejs"),
    ),
    Deno.readTextFile(
      join(import.meta.dirname, "./templates/sdk/module.ts.ejs"),
    ),
  ]);

  const context = {
    packageName: name,
    packageVersion: version,
  };

  await Promise.all(
    Object.entries(modules).map(async ([filename, details]) => {
      files[join("modules", filename)] = await ejsRender(
        moduleTemplate,
        {
          ...context,
          ...details,
          filename,
          types: globalTypesMap,
        },
      );
    }),
  );

  files["base.ts"] = await ejsRender(baseTemplate, context);
  files["types.ts"] = await ejsRender(typesTemplate, {
    ...context,
    types: globalTypesMap,
  });

  const { pluginNames, pluginFiles } = await syncPluginContent({
    pluginDir: join(opts?.cwd, opts?.pluginDir ?? "./sdk-plugins"),
    sdkDir: outputPath,
  });

  Object.assign(files, pluginFiles);

  files["deno.json"] = await ejsRender(denoJsonTemplate, {
    ...context,
    workspace: pluginNames.map((p) => `plugins/${p}`),
  });

  files["index.ts"] = await ejsRender(indexTemplate, {
    ...context,
    modulesToImport: modules,
    pluginsToImport: pluginNames,
  });

  if (!opts?.skipWrite) {
    await Promise.all(
      Object.entries(files).map(([filename, content]) =>
        writeTextFile(join(outputPath, filename), content)
      ),
    );

    if (!opts?.skipNpmBuild) {
      await generateNpmModule({
        version,
        sdkDir: outputPath,
      });
    }
  }

  return {
    outputPath,
    files,
  };
};
