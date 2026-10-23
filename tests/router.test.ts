import { equal, throws } from "node:assert/strict";
import { join } from "@std/path/join";
import { Router } from "@/core/http/router.ts";
import { limitBody, parseSize } from "@/core/http/discover.ts";
import {
  paramsAsJson,
  parseBasicAuth,
  serveAssets,
} from "@/core/http/utils.ts";

const echo = (name: string) => () => (req: Request) =>
  Response.json({ name, params: paramsAsJson(req) });

const router = new Router("/api/", function probe(router) {
  router.get("/count", function count() {
    return echo("count")();
  });
  router.get("/list/", function list() {
    return echo("list")();
  });
  router.get("/:id", function byId() {
    return echo("byId")();
  });
});

const call = async (path: string) => {
  const exec = router.route("get", path);
  if (!exec) return "no-match";

  const res = await exec(new Request("http://x"), []);
  return res.status === 200 ? JSON.stringify(await res.json()) : res.status;
};

Deno.test("Router matching", async () => {
  equal(await call("/api/count"), '{"name":"count","params":{}}');
  // Static routes follow path-to-regexp semantics: trailing slash + case-insensitive
  equal(await call("/api/count/"), '{"name":"count","params":{}}');
  equal(await call("/api/COUNT"), '{"name":"count","params":{}}');
  equal(await call("/api/list"), '{"name":"list","params":{}}');
  // The root only matches on a segment boundary
  equal(await call("/apicount"), "no-match");
  // Params are decoded exactly once (no double decoding of %25 / %2F)
  equal(await call("/api/100%25"), '{"name":"byId","params":{"id":"100%"}}');
  equal(await call("/api/a%2Fb"), '{"name":"byId","params":{"id":"a/b"}}');
  // Malformed encoding surfaces as URIError (the dispatcher answers 400)
  throws(() => router.route("get", "/api/%E0%A4%A"), URIError);
});

Deno.test("serveAssets stays inside its root", async () => {
  const dir = await Deno.makeTempDir();

  try {
    const root = join(dir, "www");
    await Deno.mkdir(root);
    await Deno.writeTextFile(join(root, "index.html"), "index");
    await Deno.writeTextFile(join(dir, "secret.env"), "secret");

    const serve = async (path: string) =>
      await (await serveAssets(new Request("http://x"), root, path)).text();

    equal(await serve("index.html"), "index");
    // Decoded `..%2F` must not escape the root; falls back to the SPA index
    equal(await serve("../secret.env"), "index");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("parseBasicAuth", () => {
  const auth = (value: string) =>
    parseBasicAuth(
      new Request("http://x", { headers: { authorization: value } }),
    );

  equal(
    JSON.stringify(auth("Basic " + btoa("user:pa:ss"))),
    '{"username":"user","password":"pa:ss"}',
  );
  equal(auth("Bearer abc.def"), null);
  equal(auth("Basic !!!"), null);
});

Deno.test("405 for a known path with an unsupported method", async () => {
  const res = await router.route("delete", "/api/count")!(
    new Request("http://x", { method: "DELETE" }),
    [],
  );

  equal(res.status, 405);
  equal(res.headers.get("allow"), "GET, HEAD");
});

Deno.test("Request body size limit", async () => {
  equal(parseSize("10mb"), 10 * 1024 ** 2);
  equal(parseSize("512"), 512);
  throws(() => parseSize("lots"));

  // Declared Content-Length is checked up front
  const declared = limitBody(
    new Request("http://x", {
      method: "POST",
      body: "x".repeat(20),
      headers: { "content-length": "20" },
    }),
    10,
  );
  equal(declared instanceof Response && declared.status, 413);

  // Chunked bodies are counted while read; the 413 Response is the rejection
  const chunked = (size: number) =>
    limitBody(
      new Request("http://x", {
        method: "POST",
        body: ReadableStream.from([new TextEncoder().encode("x".repeat(size))]),
      }),
      10,
    ) as Request;

  equal(await chunked(5).text(), "xxxxx");

  const rejection = await chunked(20).text().catch((e) => e);
  equal(rejection instanceof Response && rejection.status, 413);
});

Deno.test("500 details are hidden in production", async () => {
  const failing = new Router("/", function failing(router) {
    router.get("/", function boom() {
      return () => {
        throw new Error("db password is hunter2");
      };
    });
  });

  const original = console.error;
  console.error = () => {};

  try {
    const body = await (await failing.route("get", "/")!(
      new Request("http://x"),
      [],
    )).text();

    equal(body.includes("hunter2"), false);
  } finally {
    console.error = original;
  }
});
