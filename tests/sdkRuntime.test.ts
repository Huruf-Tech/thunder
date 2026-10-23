import { equal } from "node:assert/strict";
import { join } from "@std/path/join";
import { generateSDKContent } from "@/core/generators/sdk.ts";

// Runs inside the generated SDK (with its own deno.json), prints one JSON result
const script = `
import { compile } from "path-to-regexp";
import { ThunderSDK } from "./index.ts";

const store = new Map();
let calls = 0;

await ThunderSDK.init({
  axiosConfig: {
    adapter: async (config) => ({ data: { n: ++calls }, status: 200, statusText: "OK", headers: {}, config }),
  },
  cache: {
    setter: (k, v) => (store.set(k, v), true),
    getter: (k) => store.get(k),
    delete: (k) => store.delete(k),
    keys: () => [...store.keys()],
  },
});

const isExpired = (key) => store.get(key)?.includes('"expired"') ?? false;
const result = {};

result.numericParam = compile("/page/:page")(ThunderSDK.resolvePathParams({ page: 2 }));

await ThunderSDK.home.status({ cacheKey: "status" });
await ThunderSDK.home.status({ cacheKey: "status" });
result.requestCacheCalls = calls;

result.actions = ThunderSDK.listActions("home");

const unrelated = ThunderSDK.useCaching(["aXb", "1"], async () => 1);
await unrelated.get();
await ThunderSDK.useCaching("a(b", async () => 1).expire();
await ThunderSDK.useCaching("a.b", async () => 1).expire();
result.unrelatedExpired = isExpired(unrelated.key);

const parent = ThunderSDK.useCaching(["users"], async () => "p");
const child = ThunderSDK.useCaching(["users", "1"], async () => "c");
await parent.get();
await child.get();
await parent.invalidate();
result.childExpiredAfterInvalidate = isExpired(child.key);

let attempts = 0;
const flaky = ThunderSDK.useCaching("flaky", async () => {
  if (attempts++ === 0) throw new Error("first call fails");
  return "ok";
});
await flaky.get().catch(() => {});
result.retryAfterFailure = await flaky.get();

ThunderSDK._cacheNamespaces.user = "u1";
await ThunderSDK.clean();
result.namespacesAfterClean = ThunderSDK._cacheNamespaces;

await ThunderSDK.init({});
result.cleanWithoutCache = await ThunderSDK.clean().then(() => "ok", (e) => e.message);

console.log(JSON.stringify(result));
Deno.exit();
`;

Deno.test("Generated SDK runtime", async () => {
  const cwd = await Deno.makeTempDir();

  try {
    const { outputPath } = await generateSDKContent({
      cwd,
      outputDir: "./",
      skipNpmBuild: true,
    });

    await Deno.writeTextFile(join(outputPath, "check.ts"), script);

    const { stdout, stderr, success } = await new Deno.Command(
      Deno.execPath(),
      {
        args: ["run", "-A", "--no-check", "--config", "deno.json", "check.ts"],
        cwd: outputPath,
      },
    ).output();

    equal(success, true, new TextDecoder().decode(stderr));

    const result = JSON.parse(new TextDecoder().decode(stdout));

    equal(result.numericParam, "/page/2");
    equal(result.requestCacheCalls, 1);
    equal(result.actions.includes("home.type"), false);
    equal(result.unrelatedExpired, false);
    equal(result.childExpiredAfterInvalidate, false);
    equal(result.retryAfterFailure, "ok");
    equal(result.cleanWithoutCache, "ok");
    equal(
      JSON.stringify(result.namespacesAfterClean),
      '{"__internal":"__thunder-sdk:cache"}',
    );
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});
