import {
  createDocument,
  CreateDocumentOptions,
  ZodOpenApiOperationObject,
  ZodOpenApiPathsObject,
} from "zod-openapi";
import { join } from "@std/path/posix/join";
import { generateModules } from "./sdk.ts";
import { writeJSONFile } from "../scripts/lib/utility.ts";
import { toOpenApiPaths } from "./utils/toOpenAPIPaths.ts";
import { THandlerIOShapes, TMethod } from "../http/router.ts";
import z from "zod";

export type TGenerateOpenAPIContentOpts = {
  title?: string;
  version?: string;
  routesDir?: string;
  outputDir?: string;
  cwd?: string;
  skipWrite?: boolean;
};

const documentOptions: CreateDocumentOptions = {
  // Unknown/unsupported schema types render as an empty (any) schema instead of throwing
  allowEmptySchema: new Proxy({}, { get: () => true }),
  override: ({ jsonSchema, zodSchema: schema }) => {
    const type = schema._zod.def.type;

    if (type === "date") {
      jsonSchema.type = "string";
      jsonSchema.format ??= "date-time";
    }

    if ("meta" in schema && typeof schema.meta === "function") {
      const meta = schema.meta() as Record<string, unknown> | undefined;

      if (type === "custom") {
        jsonSchema.type = (typeof meta?.tsType === "string"
          ? meta.tsType
          : "string") as typeof jsonSchema.type;
      }
    }
  },
};

const toOperation = (
  tag: string,
  shapes?: THandlerIOShapes,
): ZodOpenApiOperationObject => ({
  tags: [tag],
  requestParams: {
    ...(shapes?.headers ? { header: shapes.headers } : {}),
    ...(shapes?.params ? { path: shapes.params } : {}),
    ...(shapes?.query ? { query: shapes.query } : {}),
  },
  ...(shapes?.body
    ? {
      requestBody: {
        content: {
          "application/json": { schema: shapes.body },
        },
      },
    }
    : {}),
  responses: {
    "200": {
      description: "200 OK",
      ...(shapes?.return
        ? {
          content: {
            "application/json": { schema: shapes.return },
          },
        }
        : {}),
    },
  },
});

const isValidOperation = (operation: ZodOpenApiOperationObject) => {
  try {
    createDocument({
      openapi: "3.1.0",
      info: { title: "", version: "" },
      paths: { "/": { post: operation } },
    }, documentOptions);

    return true;
  } catch {
    return false;
  }
};

/**
 * Replaces the shapes zod-openapi can't handle with loose equivalents.
 * Request params arrive as strings anyway, so they keep their keys.
 */
const degradeShapes = (tag: string, name: string, shapes: THandlerIOShapes) => {
  const result: Record<string, z.ZodType> = {};

  for (const [key, shape] of Object.entries(shapes)) {
    if (!shape || isValidOperation(toOperation(tag, { [key]: shape }))) {
      result[key] = shape;
      continue;
    }

    console.warn(
      `OpenAPI: The "${key}" schema of "${tag}.${name}" cannot be represented, using a loose schema instead.`,
    );

    if (key === "body" || key === "return") result[key] = z.any();
    else {
      const keys = shape instanceof z.ZodObject ? Object.keys(shape.shape) : [];

      if (keys.length) {
        result[key] = z.object(
          Object.fromEntries(keys.map((k) => [k, z.string().optional()])),
        );
      }
    }
  }

  return result as THandlerIOShapes;
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
  const operations: Array<{
    tag: string;
    name: string;
    method: Exclude<TMethod, "all">;
    endpoints: string[];
    shapes?: THandlerIOShapes;
  }> = [];

  const { modules } = await generateModules(
    { cwd, skipBuildTypes: true },
  );

  for (const [_, moduleDetails] of Object.entries(modules)) {
    for (
      const [name, methodDetails] of Object.entries(moduleDetails.methods)
    ) {
      tags.add(moduleDetails.name);
      operations.push({
        tag: moduleDetails.name,
        name,
        method: methodDetails.method === "all" ? "get" : methodDetails.method,
        endpoints: toOpenApiPaths(
          `/${moduleDetails.name}${methodDetails.endpoint}`,
        ),
        shapes: methodDetails.shapes,
      });
    }
  }

  const buildDocument = () => {
    const paths: ZodOpenApiPathsObject = {};

    for (const { tag, method, endpoints, shapes } of operations) {
      const operation = toOperation(tag, shapes);

      // Merge so multiple methods on the same endpoint don't overwrite each other
      for (const endpoint of endpoints) {
        paths[endpoint] = { ...paths[endpoint], [method]: operation };
      }
    }

    return createDocument({
      openapi: "3.1.0",
      info: {
        title,
        version,
      },
      tags: Array.from(tags).map((name) => ({ name })),
      paths,
    }, documentOptions);
  };

  let document: ReturnType<typeof createDocument>;

  try {
    document = buildDocument();
  } catch {
    // Slow path: only runs when something can't be represented
    for (const operation of operations) {
      if (
        operation.shapes &&
        !isValidOperation(toOperation(operation.tag, operation.shapes))
      ) {
        operation.shapes = degradeShapes(
          operation.tag,
          operation.name,
          operation.shapes,
        );
      }
    }

    document = buildDocument();
  }

  if (!opts.skipWrite) {
    await writeJSONFile(outputPath, document);
  }

  return document;
};
