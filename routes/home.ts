import { Router } from "@/core/http/router.ts";
import { Env } from "@/core/utils/env.ts";

export default new Router("/api/", function home(router) {
  router.get("/", function status() {
    return () => {
      return Response.json({
        environment: Env.getType(),
        msg: "Thunder api is listening the requests...",
      });
    };
  });
}).group("Default");
