import { equal, ok } from "node:assert/strict";
import { Router } from "@/core/http/router.ts";
import { routerToMethods } from "@/core/generators/sdk.ts";
import z from "zod";

Deno.test("SDK generator survives unsupported and recursive schemas", () => {
  const $tree: z.ZodType = z.object({
    name: z.string(),
    get children() {
      return z.array($tree);
    },
  }).meta({ tsLabel: "Tree" });

  const router = new Router("/api/", function stress(router) {
    router.post("/", function create() {
      return {
        shape: () => ({
          body: z.object({
            fn: z.function(),
            json: z.json(),
            tree: $tree,
            keyed: z.record(z.enum(["a", "b"]), z.number()),
            strict: z.object({ x: z.string() }).strict(),
          }),
          return: z.string().transform(Number),
        }),
        handler: () => Response.json({}),
      };
    });

    router.get("/", function broken() {
      return {
        shape: () => {
          throw new Error("boom");
        },
        handler: () => Response.json({}),
      };
    });
  });

  const methods = routerToMethods(router);

  ok(methods.create.types.body!.includes("fn: unknown;"));
  ok(methods.create.types.body!.includes("tree: Tree;"));
  ok(methods.create.types.body!.includes('[K in "a" | "b"]: number;'));
  // .strict() must not produce an index signature that conflicts with its properties (TS2411)
  ok(!methods.create.types.body!.includes("[x: string]: never"));
  equal(methods.create.types.return, "type create$return = string;");
  equal(methods.broken.shapes, undefined);
});
