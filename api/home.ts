import { Router } from "@/core/http/router.ts";

const router = new Router("home");

router.get("/", function status() {
  return () => {
    return Response.json({
      success: true,
      msg: "Thunder api is listening the requests...",
    });
  };
});

export default router;
