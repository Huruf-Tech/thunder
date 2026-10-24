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

const stored = (parts) => store.has(ThunderSDK.resolveCacheKey(parts));
const registered = (parts) =>
  ThunderSDK._useCachingMethods.has(ThunderSDK.resolveCacheKey(parts));

for (const id of ["p1", "p2"]) {
  await ThunderSDK.useCaching(["projects", id], async () => id).get();
}
await ThunderSDK.useCaching(["projects", "p1", "deployments"], async () => 1).get();
await ThunderSDK.useCaching(["projects", "p1", "releases"], async () => 2).get();
await ThunderSDK.home.status({ cacheKey: ["projects", "p1", "raw"] });

const removed = await ThunderSDK.forgetCache(["projects", "p1"], { subKeys: true });
result.forgetCacheRemoved = removed.map((k) => k.split(":").slice(-3).join(":")).sort();
result.forgetCacheLeftovers = [
  stored(["projects", "p1"]), stored(["projects", "p1", "deployments"]),
  stored(["projects", "p1", "raw"]), registered(["projects", "p1", "releases"]),
];
result.forgetCacheKeepsSibling = stored(["projects", "p2"]) && registered(["projects", "p2"]);

await ThunderSDK.useCaching(["projects", "p2", "deployments"], async () => 3).get();
await ThunderSDK.forgetCache(["projects", "p2"]);
result.forgetCacheExactOnly = !stored(["projects", "p2"]) && stored(["projects", "p2", "deployments"]);

const handle = ThunderSDK.useCaching("single", async () => "v");
await handle.get();
let notified = false;
handle.onExpire(() => (notified = true));
result.forgetReturns = await handle.forget();
await handle.expire();
result.forgetState = [stored("single"), registered("single"), notified];

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
      JSON.stringify(result.forgetCacheRemoved),
      '["cache:projects:p1","projects:p1:deployments","projects:p1:raw","projects:p1:releases"]',
    );
    equal(
      JSON.stringify(result.forgetCacheLeftovers),
      "[false,false,false,false]",
    );
    equal(result.forgetCacheKeepsSibling, true);
    equal(result.forgetCacheExactOnly, true);
    equal(result.forgetReturns, true);
    // After forget, the handle's listeners no longer fire
    equal(JSON.stringify(result.forgetState), "[false,false,false]");
    equal(
      JSON.stringify(result.namespacesAfterClean),
      '{"__internal":"__thunder-sdk:cache"}',
    );
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});
