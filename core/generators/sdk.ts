// deno-lint-ignore-file no-explicit-any
import { expandGlob } from "@std/fs/expand-glob";
import { join } from "@std/path/posix/join";
import { dirname } from "@std/path/dirname";
import { basename } from "@std/path/basename";
import { relative } from "@std/path/relative";
import { exists } from "@std/fs/exists";
import z from "zod";
import ts from "typescript";
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

// Shared across routers so recursive schemas resolve to one `Auxiliary_N` type in types.ts
const auxiliaryTypeStore = createAuxiliaryTypeStore();
const pendingLabels = new Set<string>();

/**
 * Converts a zod schema to a TS type node. Never throws: any schema the
 * converter can't handle (unknown/unsupported types, broken defs) becomes `unknown`
 * at the smallest failing node, so one bad field doesn't sink the whole SDK.
 */
const schemaToTsNode = (
  schema: z.z.core.$ZodType,
  io: "input" | "output",
  skip?: unknown,
): ts.TypeNode => {
  const overrideFunction: OptionalTypeOverrideFunction = (schema, ts) => {
    // Let zod-to-ts convert the schema itself; its children come back through here
    if (schema === skip) {
      skip = undefined;
      return;
    }

    const meta = "meta" in schema && typeof schema.meta === "function"
      ? (schema.meta() as Record<string, unknown> | undefined)
      : undefined;

    /**
     * Manual escape hatch:
     *
     * z.string()
     *   .transform((v) => new Date(v))
     *   .meta({ tsType: "Date" })
     */
    if (typeof meta?.tsType === "string") {
      return ts.factory.createTypeReferenceNode(
        ts.factory.createIdentifier(meta.tsType),
      );
    }

    const def = (schema as any)._zod?.def;

    // Transforms carry no type info. For output schemas use meta.tsType for correctness.
    if (def?.type === "transform" || def?.type === "custom") {
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
    }

    // z.string().transform(...) as an output: fall back to the input side
    if (
      def?.type === "pipe" && io === "output" &&
      def.out?._zod?.def?.type === "transform"
    ) {
      return schemaToTsNode(def.in, io);
    }

    // { [K in Key]: Value } — same as Record<Key, Value>, but allowed in recursive types (e.g. z.json())
    if (def?.type === "record") {
      return ts.factory.createMappedTypeNode(
        undefined,
        ts.factory.createTypeParameterDeclaration(
          undefined,
          "K",
          schemaToTsNode(def.keyType, io),
        ),
        undefined,
        undefined,
        schemaToTsNode(def.valueType, io),
        undefined,
      );
    }

    if (typeof meta?.tsLabel === "string") {
      if (
        !globalTypesMap.has(meta.tsLabel) && !pendingLabels.has(meta.tsLabel)
      ) {
        pendingLabels.add(meta.tsLabel);

        globalTypesMap.set(
          meta.tsLabel,
          printNode(
            createTypeAlias(schemaToTsNode(schema, io, schema), meta.tsLabel),
          ),
        );

        pendingLabels.delete(meta.tsLabel);
      }

      return ts.factory.createTypeReferenceNode(
        ts.factory.createIdentifier(meta.tsLabel),
      );
    }

    // Convert each node in its own call so failures stay local to it
    return schemaToTsNode(schema, io, schema);
  };

  try {
    return zodToTs(schema, { auxiliaryTypeStore, overrideFunction, io }).node;
  } catch (error) {
    auxiliaryTypeStore.definitions.delete(schema);

    console.warn(
      `SDK: Unsupported schema type "${
        (schema as any)?._zod?.def?.type
      }", falling back to unknown.`,
      error instanceof Error ? error.message : error,
    );

    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
  }
};

const resolveShapes = (
  handler: unknown,
  name: string,
): THandlerIOShapes | undefined => {
  if (
    typeof handler === "object" && handler !== null && "shape" in handler &&
    typeof handler.shape === "function"
  ) {
    try {
      return handler.shape();
    } catch (error) {
      console.warn(`Failed to resolve the shape of handler "${name}"!`, error);
    }
  }
};

export const routerToMethods = (router: Router, opts?: {
  skipBuildTypes?: boolean;
}) => {
  const methods: Record<string, TSDKMethodDetails> = {};

  for (const [_, { fullPath, methods: httpMethods }] of router["registry"]) {
    for (const [httpMethod, { name, handler }] of Object.entries(httpMethods)) {
      const shapes = resolveShapes(handler, name);

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

          const node = schemaToTsNode(
            shape,
            key === "return" ? "output" : "input",
          );

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
  group?: string;
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

  for (const { router, path } of routers) {
    if (modules[router.name]) {
      console.warn(`Duplicate router detected ${router.name}`);
    }

    const methods = routerToMethods(router, opts);

    modules[basename(path)] = {
      name: router.name,
      group: router.groupName,
      metadata: router.metadata,
      methods,
    };
  }

  for (const { identifier, node } of auxiliaryTypeStore.definitions.values()) {
    if (node) globalTypesMap.set(identifier.text, printNode(node));
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

  [K: string | number | symbol]: unknown;
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
    import { build } from "jsr:@deno/dnt";

    // Keep npm/node_modules between builds so dnt's npm install is a quick no-op
    for (const dir of ["esm", "script", "src"]) {
      await Deno.remove("./npm/" + dir, { recursive: true }).catch(() => {});
    }

    await build({
      entryPoints: [
        "./index.ts", 
        {
          name: "./base",
          path: "./base.ts",
        },
        {
          name: "./types",
          path: "./types.ts",
        }
      ],
      outDir: "./npm",
      shims: {
        // see JS docs for overview and more options
        deno: true,
      },
      test: false,
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
      const source = Object.values(details.methods)
        .flatMap(({ types }) => Object.values(types))
        .join("\n");

      // Import only the global types this module uses, so a change to an unrelated
      // type doesn't rewrite every module (and force a full npm rebuild)
      const types = new Map(
        Array.from(globalTypesMap).filter(([name]) =>
          new RegExp(`\\b${RegExp.escape(name)}\\b`).test(source)
        ),
      );

      files[join("modules", filename)] = await ejsRender(
        moduleTemplate,
        {
          ...context,
          ...details,
          filename,
          types,
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
    pluginDir: join(cwd, opts?.pluginDir ?? "./sdk-plugins"),
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
    // Only touch files whose content changed, so a re-run with no changes skips the npm build
    const changes = await Promise.all(
      Object.entries(files).map(async ([filename, content]) => {
        const path = join(outputPath, filename);
        const current = await Deno.readTextFile(path).catch(() => undefined);

        if (current === content) return false;

        await writeTextFile(path, content);

        return true;
      }),
    );

    const tarballPath = join(outputPath, "package.tgz");

    if (
      !opts?.skipNpmBuild &&
      (changes.includes(true) || !await exists(tarballPath))
    ) {
      // A failed build must not leave a stale tarball that makes the next run skip
      await Deno.remove(tarballPath).catch(() => {});

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
