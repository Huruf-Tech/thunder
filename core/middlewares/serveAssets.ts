import { exists } from "@std/fs";
import { join } from "@std/path/join";
import { serveFile } from "@std/http/file-server";

export const serveAssets = async (req: Request) => {
  const url = new URL(req.url);

  const [namespace, ...subPath] = url.pathname.split("/").filter(Boolean);

  const root = join(Deno.cwd(), "public", namespace || "~", "www");

  if (!await exists(root)) return new Response("Not found", { status: 404 });

  let IndexFile = "index.html";

  if (!await exists(join(root, IndexFile))) {
    const WWWItems = Deno.readDirSync(root);

    for (const item of WWWItems) {
      if (!item.isDirectory && /^index.*/.test(item.name)) {
        IndexFile = item.name;
        break;
      }
    }
  }

  return await serveFile(req, join(root, ...subPath)).then(async (res) => {
    if (res.status === 404) {
      return await serveFile(req, join(root, IndexFile));
    }

    return res;
  });
};
