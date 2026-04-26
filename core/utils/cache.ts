// deno-lint-ignore-file no-explicit-any
import { hash } from "ohash";

type AnyFn = (...args: any[]) => Promise<any>;

type AwaitedReturn<T extends AnyFn> = Awaited<ReturnType<T>>;

interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  promise?: Promise<T>; // for in-flight deduplication
}

function cacheWithTTL<T extends AnyFn>(
  fn: T,
  ttl: number,
  options?: {
    keyResolver?: (...args: Parameters<T>) => string;
  },
): T {
  const cache = new Map<string, CacheEntry<AwaitedReturn<T>>>();

  const getKey = options?.keyResolver ??
    ((...args: Parameters<T>) => JSON.stringify(args));

  return async function (...args: Parameters<T>) {
    const key = getKey(...args);
    const now = Date.now();

    let entry = cache.get(key);

    // ✅ Valid cache hit
    if (entry && entry.value !== undefined && entry.expiresAt > now) {
      return entry.value;
    }

    // ✅ Deduplicate in-flight request
    if (entry?.promise) {
      return entry.promise;
    }

    // ❗ Execute function
    const promise = Promise.resolve(fn(...args));

    entry = {
      expiresAt: now + ttl,
      promise,
    };

    cache.set(key, entry);

    try {
      const result = await promise;

      cache.set(key, {
        value: result,
        expiresAt: Date.now() + ttl,
      });

      return result;
    } catch (err) {
      // ❗ On failure, don't cache
      cache.delete(key);
      throw err;
    }
  } as T;
}

export function cache<T extends AnyFn>(
  fn: T,
  ttl: number,
) {
  return cacheWithTTL<T>(fn, ttl, {
    keyResolver: (...args) => hash(args),
  });
}
