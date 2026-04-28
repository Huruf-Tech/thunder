import { Router } from "@/core/http/router.ts";
import { paramsAsJson, serveAssets } from "@/core/http/utils.ts";
import { fromFileUrl } from "@std/path/from-file-url";
import z from "zod";

export default new Router("/", function index(router) {
  router.get("/app{/*endpoint}", function app() {
    const $params = z.object({
      endpoint: z.array(z.string()).optional(),
    });

    return {
      shape: () => ({
        params: $params,
      }),
      handler: (req) => {
        const { endpoint } = $params.parse(paramsAsJson(req));

        return serveAssets(
          req,
          fromFileUrl(import.meta.resolve("../public/app/www")),
          endpoint?.join("/"),
        );
      },
    };
  });

  router.get("{/*endpoint}", function index() {
    const $params = z.object({
      endpoint: z.array(z.string()).optional(),
    });

    return {
      shape: () => ({
        params: $params,
      }),
      handler: (req) => {
        const { endpoint } = $params.parse(paramsAsJson(req));

        return serveAssets(
          req,
          fromFileUrl(import.meta.resolve("../public/www")),
          endpoint?.join("/"),
        );
      },
    };
  });
}).group("Default");
