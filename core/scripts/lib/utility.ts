// deno-lint-ignore-file no-explicit-any
import { Readable } from "node:stream";
import { Buffer } from "node:buffer";
import { ensureDir } from "@std/fs/ensure-dir";
import { dirname, resolve } from "@std/path";
import { deepMerge } from "@std/collections/deep-merge";

export const printStream = async (stream: ReadableStream<Uint8Array>) => {
  const Output: string[] = [];
  const Reader = stream.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await Reader.read();

    if (done) break;

    Output.push(decoder.decode(value, { stream: true }));

    Deno.stdout.write(value);
  }

  Reader.releaseLock();

  return Output;
};

export const nodeReadableToDenoReadableStream = (nodeReadable: Readable) => {
  return new ReadableStream({
    start(controller) {
      nodeReadable.on("data", (chunk) => {
        // Convert the chunk to Uint8Array if it's not already
        let uint8ArrayChunk;

        if (Buffer.isBuffer(chunk)) uint8ArrayChunk = new Uint8Array(chunk);
        else if (typeof chunk === "string") {
          uint8ArrayChunk = new TextEncoder().encode(chunk);
        } else throw new Error("Unsupported chunk type");

        // Enqueue the chunk into the Deno ReadableStream
        controller.enqueue(uint8ArrayChunk);
      });

      nodeReadable.on("end", () => {
        // Close the Deno ReadableStream when Node.js stream ends
        controller.close();
      });

      nodeReadable.on("error", (err) => {
        // Handle errors in Node.js stream by signaling the error in Deno stream
        controller.error(err);
      });
    },
  });
};

export const writeTextFile = async (
  path: string,
  data: string | ReadableStream<string>,
  options?: Deno.WriteFileOptions,
) => {
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeTextFile(path, data, options);
};

export const readJSONFile = async <T = unknown>(
  path: string | URL,
  options?: Deno.ReadFileOptions,
) => JSON.parse(await Deno.readTextFile(path, options)) as T;

export const writeJSONFile = (
  path: string,
  data: any,
  options?: Deno.WriteFileOptions,
) =>
  writeTextFile(
    path,
    JSON.stringify(
      data,
      undefined,
      2,
    ),
    options,
  );

export const symlink = async (target: string, linkPath: string) => {
  // Make both paths absolute and correct for the current repo
  const absTarget = resolve(target);
  const absLink = resolve(linkPath);

  // Ensure destination parent exists
  await ensureDir(dirname(absLink));

  // Remove existing destination if present
  try {
    await Deno.remove(absLink, { recursive: true });
  } catch {
    // ignore if it doesn't exist
  }

  // Create link (junction on Windows is most reliable)
  if (Deno.build.os === "windows") {
    await Deno.symlink(absTarget, absLink, { type: "junction" });
  } else {
    await Deno.symlink(absTarget, absLink, { type: "dir" });
  }
};

export function deepMergeUnique<T extends Record<PropertyKey, unknown>>(
  a: T,
  b: T,
): T {
  const merged = deepMerge(a, b);

  function fix(value: any): any {
    if (Array.isArray(value)) {
      return [...new Set(value.map(fix))];
    }

    if (value && typeof value === "object") {
      for (const k in value) {
        value[k] = fix(value[k]);
      }
    }

    return value;
  }

  return fix(merged);
}
