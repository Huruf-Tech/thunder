import { hash } from "ohash";

// deno-lint-ignore no-explicit-any
export type AnyFn = (...args: any[]) => any;

export type CachedFn<T extends AnyFn> = (
  ...args: Parameters<T>
) => ReturnType<T>;

export function cache<T extends AnyFn>(fn: T, ttl: number): CachedFn<T>;
export function cache<T extends AnyFn>(fn: T, keyObject: object): CachedFn<T>;
export function cache<T extends AnyFn>(
  fn: T,
  ttlOrKey: number | object,
): CachedFn<T> {
  const entry = getRegistryEntry(fn);

  if (typeof ttlOrKey === "number") {
    const existing = entry.byTtl.get(ttlOrKey);
    if (existing) return existing as CachedFn<T>;
    const created = createTtlCached(fn, ttlOrKey);
    entry.byTtl.set(ttlOrKey, created as CachedFn<AnyFn>);
    return created;
  }

  if (typeof ttlOrKey === "object" && ttlOrKey !== null) {
    const existing = entry.byKey.get(ttlOrKey);
    if (existing) return existing as CachedFn<T>;
    const created = createKeyedCached(fn, ttlOrKey);
    entry.byKey.set(ttlOrKey, created as CachedFn<AnyFn>);
    return created;
  }

  throw new TypeError(
    "cache: second argument must be a ttl (number) or a keyObject (object)",
  );
}

interface RegistryEntry {
  /** Dedup per (fn, ttl) pair. */
  byTtl: Map<number, CachedFn<AnyFn>>;
  /** Dedup per (fn, keyObject) pair. */
  byKey: WeakMap<object, CachedFn<AnyFn>>;
}

/** fn is held weakly, so all of its cached functions are collectable with it. */
const registry = new WeakMap<AnyFn, RegistryEntry>();

function getRegistryEntry(fn: AnyFn): RegistryEntry {
  let entry = registry.get(fn);
  if (!entry) {
    entry = { byTtl: new Map(), byKey: new WeakMap() };
    registry.set(fn, entry);
  }
  return entry;
}

interface TtlEntry {
  value: unknown;
  expiresAt: number;
}

function createTtlCached<T extends AnyFn>(fn: T, ttl: number): CachedFn<T> {
  const store = new Map<string, TtlEntry>();
  let sweepTimer: ReturnType<typeof setInterval> | undefined;

  // Timer delays are stored as a 32-bit signed int; larger values (or Infinity)
  // overflow and get clamped to 1ms by the runtime.
  const MAX_TIMER_DELAY = 2_147_483_647;
  const sweepPeriod = Math.min(Math.max(ttl, 1), MAX_TIMER_DELAY);

  const scheduleSweep = () => {
    // Non-finite ttl means entries never expire, so there is nothing to sweep.
    if (sweepTimer !== undefined || !Number.isFinite(ttl)) return;
    const id = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (entry.expiresAt <= now) store.delete(key);
      }
      if (store.size === 0 && sweepTimer !== undefined) {
        clearInterval(sweepTimer);
        sweepTimer = undefined;
      }
    }, sweepPeriod);
    sweepTimer = id;
    // Never let the sweep keep the Deno process alive.
    Deno.unrefTimer(id);
  };

  const cached = (...args: Parameters<T>): ReturnType<T> => {
    const key = hash(args);
    const now = Date.now();

    const hit = store.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.value as ReturnType<T>;
    }

    const result = fn(...args);
    const entry: TtlEntry = { value: result, expiresAt: now + ttl };
    store.set(key, entry);
    scheduleSweep();

    if (isPromise(result)) {
      result.then(undefined, () => {
        // Only evict if this exact pending result is still cached.
        if (store.get(key) === entry) store.delete(key);
      });
    }

    return result as ReturnType<T>;
  };

  return cached;
}

function createKeyedCached<T extends AnyFn>(
  fn: T,
  keyObject: object,
): CachedFn<T> {
  const ref = new WeakRef(keyObject);
  // Private to this CachedFn; the data Map is reachable only via this weak key,
  // so all cached entries become collectable once keyObject is collected.
  const store = new WeakMap<object, Map<string, unknown>>();

  const cached = (...args: Parameters<T>): ReturnType<T> => {
    const ko = ref.deref();
    if (ko === undefined) {
      throw new Error(
        "cache: keyObject has been garbage collected; cached function is no longer usable",
      );
    }

    let bucket = store.get(ko);
    if (!bucket) {
      bucket = new Map();
      store.set(ko, bucket);
    }

    const key = hash(args);
    if (bucket.has(key)) {
      return bucket.get(key) as ReturnType<T>;
    }

    const result = fn(...args);
    bucket.set(key, result);

    if (isPromise(result)) {
      result.then(undefined, () => {
        // Only evict if this exact pending result is still cached.
        if (bucket!.get(key) === result) bucket!.delete(key);
      });
    }

    return result as ReturnType<T>;
  };

  return cached;
}

function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value != null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Memoize forever using a caller-provided string key.
 *
 * Unlike {@link cache}, this never hashes the arguments (no ohash), so it is
 * cheap enough for hot paths that look up the same constant keys on every
 * request. Pending promises are evicted on rejection so failed work retries.
 */
export function memoize<A extends unknown[], R>(
  fn: (...args: A) => R,
  keyFn: (...args: A) => string,
): (...args: A) => R {
  const store = new Map<string, R>();

  return (...args: A): R => {
    const key = keyFn(...args);

    if (store.has(key)) return store.get(key) as R;

    const result = fn(...args);
    store.set(key, result);

    if (isPromise(result)) {
      result.then(undefined, () => {
        if (store.get(key) === result) store.delete(key);
      });
    }

    return result;
  };
}
