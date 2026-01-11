import { get } from "@/core/http/methods.ts";

get("/", function home() {
  return () => {
    return Response.json({
      success: true,
      msg: "Thunder api is listening the requests...",
    });
  };
});
