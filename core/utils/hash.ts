import { createHash as nodeCreateHash } from "node:crypto";

export enum SupportedHashAlg {
  SHA_1 = "SHA-1",
  SHA_256 = "SHA-256",
  SHA_384 = "SHA-384",
  SHA_512 = "SHA-512",

  sha_1 = "sha-1",
  sha_256 = "sha-256",
  sha_384 = "sha-384",
  sha_512 = "sha-512",
}

export type HashAlg = SupportedHashAlg | AlgorithmIdentifier;

type NodeHashAlg = "sha1" | "sha256" | "sha384" | "sha512";

const toNodeHashAlg = (alg: HashAlg): NodeHashAlg => {
  const value = typeof alg === "string" ? alg.toLowerCase() : String(alg);

  switch (value) {
    case "sha-1":
    case "sha1":
      return "sha1";

    case "sha-256":
    case "sha256":
      return "sha256";

    case "sha-384":
    case "sha384":
      return "sha384";

    case "sha-512":
    case "sha512":
      return "sha512";

    default:
      throw new Error(`Unsupported hash algorithm: ${String(alg)}`);
  }
};

const toBase64Url = (base64: string) => {
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

// Async Web Crypto version
export const createHash = async (alg: HashAlg, data: string) => {
  const dataUint8 = new TextEncoder().encode(data);

  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest(alg, dataUint8)),
  );

  return hash.map((b) => b.toString(16).padStart(2, "0")).join("");
};

// Async Web Crypto version
export const createHashBase64 = async (alg: HashAlg, data: string) => {
  const dataUint8 = new TextEncoder().encode(data);

  const hash = String.fromCharCode(
    ...new Uint8Array(await crypto.subtle.digest(alg, dataUint8)),
  );

  return toBase64Url(btoa(hash));
};

// Sync Node/Deno version
export const createHashSync = (alg: HashAlg, data: string) => {
  return nodeCreateHash(toNodeHashAlg(alg)).update(data).digest("hex");
};

// Sync Node/Deno version
export const createHashBase64Sync = (alg: HashAlg, data: string) => {
  return toBase64Url(
    nodeCreateHash(toNodeHashAlg(alg)).update(data).digest("base64"),
  );
};
