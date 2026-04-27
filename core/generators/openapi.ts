import {
  createDocument,
  ZodOpenApiPathItemObject,
  ZodOpenApiPathsObject,
} from "zod-openapi";
import { join } from "@std/path/posix/join";
import { generateModules } from "./sdk.ts";
import { writeJSONFile } from "../scripts/lib/utility.ts";
import { toOpenApiPaths } from "./utils/toOpenAPIPaths.ts";
import z from "zod";

export type TGenerateOpenAPIContentOpts = {
  title?: string;
  version?: string;
  routesDir?: string;
  outputDir?: string;
  cwd?: string;
  skipWrite?: boolean;
};

export const generateOpenAPIContent = async (
  opts: TGenerateOpenAPIContentOpts,
) => {
  const cwd = opts?.cwd ?? Deno.cwd();
  const title = opts?.title ?? "thunder-api";
  const version = opts?.version ?? "0.0.0";
  const outputPath = join(
    cwd,
    opts?.outputDir ?? "./public/www",
    "openapi-spec.json",
  );

  const tags = new Set<string>();
  const paths: ZodOpenApiPathsObject = {};

  const { modules } = await generateModules(
    { cwd, skipBuildTypes: true },
  );

  for (const [_, moduleDetails] of Object.entries(modules)) {
    for (
      const [_, methodDetails] of Object.entries(moduleDetails.methods)
    ) {
      const path: ZodOpenApiPathItemObject = {};

      const method = methodDetails.method === "all"
        ? "get"
        : methodDetails.method;

      tags.add(moduleDetails.name);
      path[method] = {
        tags: [moduleDetails.name],
        requestParams: {
          ...(methodDetails.shapes?.headers
            ? { header: methodDetails.shapes.headers }
            : {}),
          ...(methodDetails.shapes?.params
            ? { path: methodDetails.shapes.params }
            : {}),
          ...(methodDetails.shapes?.query
            ? { query: methodDetails.shapes.query }
            : {}),
        },
        ...(methodDetails.shapes?.body
          ? {
            requestBody: {
              content: {
                "application/json": { schema: methodDetails.shapes.body },
              },
            },
          }
          : {}),
        responses: {
          "200": {
            description: "200 OK",
            ...(methodDetails.shapes?.return
              ? {
                content: {
                  "application/json": { schema: methodDetails.shapes.return },
                },
              }
              : {}),
          },
        },
      };

      toOpenApiPaths(`/${moduleDetails.name}${methodDetails.endpoint}`).forEach(
        (endpoint) => {
          paths[endpoint] = path;
        },
      );
    }
  }

  const document = createDocument({
    openapi: "3.1.0",
    info: {
      title,
      version,
    },
    tags: Array.from(tags).map((name) => ({ name })),
    paths,
  }, {
    override: ({ jsonSchema, zodSchema: schema }) => {
      if ("meta" in schema && typeof schema.meta === "function") {
        const meta = schema.meta() as Record<string, unknown> | undefined;

        if (schema instanceof z.ZodCustom) {
          let type = "string";

          if (typeof meta?.tsType === "string") {
            type = meta.tsType;
          }

          jsonSchema.type = type as typeof jsonSchema.type;
        }
      }
    },
  });

  if (!opts.skipWrite) {
    await writeJSONFile(outputPath, document);
  }
};
