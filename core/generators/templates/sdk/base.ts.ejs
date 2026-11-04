import axios, { type AxiosRequestConfig, type AxiosInstance, type AxiosResponse } from "axios";
import type { TSDKOptions, TCacheKey, TCacheOptions } from "./types.ts";

// Structural equality for JSON data: exits at the first difference and, unlike
// comparing JSON.stringify output, builds no large strings (~3x faster when equal)
const deepEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;

        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }

        return true;
    }

    if (Array.isArray(b)) return false;

    let keys = 0;

    for (const key in a) {
        if (!Object.hasOwn(b, key) || !deepEqual(a[key], b[key])) return false;
        keys++;
    }

    for (const _ in b) keys--;

    return keys === 0;
};

export class BaseSDK {
    protected static _moduleGroup = new Map<object, string>();
    protected static _moduleMetadata = new Map<object, Record<string, unknown>>();

    protected static _useCachingMethods = new Map<string, unknown>();
    protected static _cachingActivity = new Map<string, {
        controller: AbortController,
        resultPromise: unknown,
        timestamp: number,
    }>();
    protected static _cacheNamespacesDefault: Record<string, string | null> = {
        __internal: "__thunder-sdk:cache",
    };
    protected static _cacheNamespaces = { ...this._cacheNamespacesDefault };

    static _options?: TSDKOptions;
    static _axios?: AxiosInstance;

    static plugins: Record<string, any> = {};

    static resolveAxiosConfig(config: AxiosRequestConfig) {
        if (config?.headers) {
            const headerKeys = Object.keys(config.headers);

            if (headerKeys.length) {
                config.headers = headerKeys.reduce((headers, key) => {
                    headers[key.toLowerCase()] = config.headers![key];

                    return headers;
                }, {} as Record<string, string>);
            }
        }

        return config;
    };

    static resolvePathParams(params?: Record<string, unknown>) {
        if (!params) return params;

        // path-to-regexp only accepts strings (e.g. z.coerce.number() params are numbers)
        return Object.fromEntries(
            Object.entries(params)
                .filter(([, value]) => value !== undefined && value !== null)
                .map(([key, value]) => [
                    key,
                    value instanceof Array ? value.map(String) : String(value),
                ]),
        ) as Record<string, string | string[]>;
    }

    static log(...args: unknown[]) {
        if(this._options?.logs) {
            console.log("Thunder SDK::", ...args);
        }
    }

    static async init(options?: TSDKOptions) {
        this._options = options;
        this._axios = axios.create(options?.axiosConfig);

        await Promise.all(Object.values(this.plugins).map(async plugin => {
            if(typeof plugin.init === "function") {
                await plugin.init();
            }
        }));
    }

    static async clean() {
        await Promise.all(Object.values(this.plugins).map(async plugin => {
            if(typeof plugin.clean === "function") {
                await plugin.clean();
            }
        }));

        // Cache is optional (and keys() is optional within it)
        if (this._options?.cache?.delete && this._options.cache.keys) {
            await this.clearCache();
        }

        delete this._options;
        delete this._axios;

        this._useCachingMethods = new Map();
        this._cachingActivity = new Map();
        this._cacheNamespaces = { ...this._cacheNamespacesDefault };
    }

    static isPermitted = (scope: string | Function & { __scope?: string }, action?: string): boolean => {
        return true;
    }

    static checkPermission(scope: string | Function & { __scope?: string }, action?: string) {
        if(!this.isPermitted(scope, action))
            throw new Error(`You are not authorized to perform this action! Missing permission '${scope}.${action}'!`);
    }

    static resolveCacheKey(keys: TCacheKey, namespace?: string) {
        const internalNamespaces = Object.values(this._cacheNamespaces);
        return [...internalNamespaces, namespace, ...(keys instanceof Array ? keys : [keys])].filter(Boolean).join(":");
    }

    static async setCache(keys: TCacheKey, value: any) {
        if(typeof this._options?.cache?.setter !== "function")
            throw new Error("A cache setter is not defined!");

        return await this._options.cache.setter(
            this.resolveCacheKey(keys),
            JSON.stringify({ value, timestamp: Date.now() / 1000 })
        );
    }

    static async getCache<T>(keys: TCacheKey) {
        if(typeof this._options?.cache?.getter !== "function")
            throw new Error("A cache getter is not defined!");

        const value = await this._options.cache.getter(this.resolveCacheKey(keys));

        if(!value) return null;

        return JSON.parse(value) as {
            value: T;
            timestamp: number;
            expired?: boolean;
        };
    }

    static async expireCache(keys: TCacheKey) {
        if(typeof this._options?.cache?.getter !== "function")
            throw new Error("A cache getter is not defined!");
            
        if(typeof this._options?.cache?.setter !== "function")
            throw new Error("A cache setter is not defined!");

        const value = await this._options.cache.getter(this.resolveCacheKey(keys));

        if(!value || /^{\s*"expired"/.test(value)) return false;

        return await this._options.cache.setter(
            this.resolveCacheKey(keys),
            `{"expired": true,` + value.substring(1)
        );
    }

    static async delCache(keys: TCacheKey) {
        if(typeof this._options?.cache?.delete !== "function")
            throw new Error("A cache delete function is not defined!");

        return await this._options.cache.delete(this.resolveCacheKey(keys));
    }

    /**
     * Forgets the entry for `keys`; with `subKeys`, every registered entry under
     * that prefix too. Returns the resolved keys it removed.
     */
    static async forgetCache(keys: TCacheKey, options?: { subKeys?: boolean }) {
        if(typeof this._options?.cache?.delete !== "function")
            throw new Error("A cache delete function is not defined!");

        const prefix = this.resolveCacheKey(keys);
        const matches = (key: string) =>
            key === prefix || (!!options?.subKeys && key.startsWith(prefix + ":"));

        const removed = new Set<string>();

        // Registered useCaching handles: value, listeners and registration
        for (const [key, methods] of this._useCachingMethods) {
            if (matches(key)) {
                await (methods as { forget(): Promise<boolean> }).forget();
                removed.add(key);
            }
        }

        // Plain cached values without a handle (e.g. a request's `cacheKey`)
        const storedKeys = options?.subKeys && typeof this._options.cache.keys === "function"
            ? (await this.cacheKeys(prefix)).filter(matches)
            : [prefix];

        for (const key of storedKeys) {
            if (!removed.has(key) && await this._options.cache.delete(key)) {
                removed.add(key);
            }
        }

        return [...removed];
    }

    static async clearCache() {
        if(typeof this._options?.cache?.delete !== "function")
            throw new Error("A cache delete function is not defined!");

        const keys = await this.cacheKeys();
        
        await Promise.all(keys.map(key => this._options!.cache!.delete!(key)));
    }

    static async cacheKeys(startsWith?: string) {
        if(typeof this._options?.cache?.keys !== "function")
            throw new Error("A cache keys function is not defined!");

        return (await this._options.cache.keys()).filter(key => key.startsWith(startsWith ?? this.resolveCacheKey("")));
    }

    /** Whether a cached entry needs refetching: marked expired, or older than `cacheTTL` (seconds). */
    static isCacheStale<T>(cached: { value: T; timestamp: number; expired?: boolean }, options?: TCacheOptions<T>) {
        if (cached.expired) return true;
        if (!options?.cacheTTL) return false;

        const ttl = typeof options.cacheTTL === "function"
            ? options.cacheTTL(cached.value, cached.timestamp)
            : options.cacheTTL;

        return cached.timestamp + ttl < Date.now() / 1000;
    }

    static async useCache<T>(callback: () => T | Promise<T>, options?: TCacheOptions<T>) {
        const Cached = options?.cacheKey ? await this.getCache<T>(options.cacheKey) : null;

        returnCache: if (Cached !== null) {
            if (this.isCacheStale(Cached, options)) {
                // Persist a TTL expiry so other readers see it too
                if (!Cached.expired) await this.expireCache(options!.cacheKey!);

                break returnCache;
            }

            return Cached.value;
        }

        try {
            const Results = await callback();

            if (options?.cacheKey && ![null, undefined].includes(Results as any)) {
                await this.setCache(options.cacheKey, Results);
            }

            return Results as T;
        } catch(error) {
            if(Cached) return Cached.value;

            throw error;
        }
    }

    static useCaching<T>(cacheKey: TCacheKey, callback: (opts: { signal: AbortSignal }) => T | Promise<T>, options?: Omit<TCacheOptions<T>, "cacheKey">, freshMethods = false) {
        const resolvedCacheKey = this.resolveCacheKey(cacheKey);

        const _methods = this._useCachingMethods.get(resolvedCacheKey) as typeof methods;

        if(_methods && !freshMethods) return _methods;

        const cacheOptions = { cacheKey, ...options };

        /** `onFetched` runs only when data came from the callback (not from the cache) */
        const load = (onFetched?: () => void) => {
            return this.useCache<T>(async () => {
                const activity = this._cachingActivity.get(resolvedCacheKey);

                if(activity) {
                    if(Date.now() - activity.timestamp > 1000) {
                        activity.controller.abort("Repeated request!");
                    } else {
                        const result = await (activity.resultPromise as Promise<T>);

                        onFetched?.();

                        return result;
                    }
                }

                const controller = new AbortController();
                const resultPromise = callback({ signal: controller.signal });

                this._cachingActivity.set(resolvedCacheKey, {
                    controller,
                    resultPromise,
                    timestamp: Date.now(),
                });

                try {
                    const result = await resultPromise;

                    onFetched?.();

                    return result;
                } finally {
                    if (this._cachingActivity.get(resolvedCacheKey)?.resultPromise === resultPromise) {
                        this._cachingActivity.delete(resolvedCacheKey);
                    }
                }
            }, cacheOptions)
        };

        const get = () => load();

        const isSubKey = (key: string, baseKey: string) => {
            const prefix = this.resolveCacheKey(baseKey);

            return key === prefix || key.startsWith(prefix + ":");
        };

        const expireCallbacks = new Set<() => void>();

        const onExpire = (callback: () => void) => {
            expireCallbacks.add(callback);
        }

        const offExpire = (callback: () => void) => {
            expireCallbacks.delete(callback);
        }

        const expire = async (options?: { stopPropagation?: boolean }) => {
            if(!options?.stopPropagation) {
                const baseKey = cacheKey instanceof Array ? cacheKey[0] : cacheKey;
                const cacheKeys = Array.from(this._useCachingMethods.keys());
            
                await Promise.all(cacheKeys.map(async (key) => {
                    if(resolvedCacheKey !== key && isSubKey(key, baseKey)) {
                        const cachingMethods = this._useCachingMethods.get(key) as typeof methods;

                        await cachingMethods.expire({ stopPropagation: true });
                    }
                }));
            }

            const expired = await this.expireCache(cacheKey);

            for (const callback of expireCallbacks) {
                callback();
            }

            return expired;
        }

        const del = () => this.delCache(cacheKey);

        const invalidateCallbacks = new Set<(data: T) => void>();

        const onInvalidate = (callback: (data: T) => void) => {
            invalidateCallbacks.add(callback);
        }

        const offInvalidate = (callback: (data: T) => void) => {
            invalidateCallbacks.delete(callback);
        }

        const invalidate = async (options?: { stopPropagation?: boolean }) => {
            if(!options?.stopPropagation) {
                const baseKey = cacheKey instanceof Array ? cacheKey[0] : cacheKey;
                const cacheKeys = Array.from(this._useCachingMethods.keys());
            
                await Promise.all(cacheKeys.map(async (key) => {
                    if(resolvedCacheKey !== key && isSubKey(key, baseKey)) {
                        const cachingMethods = this._useCachingMethods.get(key) as typeof methods;

                        await cachingMethods.invalidate({ stopPropagation: true });
                    }
                }));
            }

            await expire({ stopPropagation: true });

            const data = await get();

            for (const callback of invalidateCallbacks) {
                callback(data);
            }

            return data;
        }

        /** Deletes the cached value, drops its invalidate/expire listeners and unregisters the key. */
        const forget = async () => {
            expireCallbacks.clear();
            invalidateCallbacks.clear();

            if (this._useCachingMethods.get(resolvedCacheKey) === methods) {
                this._useCachingMethods.delete(resolvedCacheKey);
            }

            // An in-flight fetch would otherwise write the value back after it was forgotten
            const activity = this._cachingActivity.get(resolvedCacheKey);

            if (activity) {
                activity.controller.abort("Forgotten");
                this._cachingActivity.delete(resolvedCacheKey);
            }

            return await this.delCache(cacheKey);
        };

        const sdk = this;

        /**
         * "Show cached, then fresh": yields the cached value (even if expired), then the
         * fetched value only if the cache was stale and the data actually changed.
         * Nothing cached → yields the fetched value once. The loop ending means "up to date".
         *
         * for await (const data of handle.iterate()) render(data);
         */
        const iterate = async function* (): AsyncGenerator<T> {
            const cached = await sdk.getCache<T>(cacheKey);

            if (cached) {
                yield cached.value;

                // Fresh cache: nothing newer to show, no fetch, no comparison
                if (!sdk.isCacheStale(cached, cacheOptions)) return;
            }

            let fetched = false;
            const value = await load(() => (fetched = true));

            // Not fetched = cache fallback after a failed request; unchanged = skip the re-render
            if (!cached || (fetched && !deepEqual(value, cached.value))) yield value;
        };

        const methods = { key: resolvedCacheKey, get, iterate, expire, del, forget, invalidate, onInvalidate, offInvalidate, onExpire, offExpire };

        this._useCachingMethods.set(resolvedCacheKey, methods);

        return methods;
    }

    static async withCaching(callback: (methods: ReturnType<typeof BaseSDK.useCaching>, key: string) => void | Promise<void>, options?: { matcher?: RegExp }) {
        for (const [key, methods] of this._useCachingMethods) {
            if(options && options.matcher instanceof RegExp && !options.matcher.test(key))
                continue;

            await callback(methods as any, key);
        }
    }

    static resolveAxiosResponse<T>(executor: () => Promise<AxiosResponse<T>>, options?: TCacheOptions<T>) {
        if (!this._axios) throw new Error("Axios not initialized!");

        const sdk = this;

        const executors = {
            get raw() {
                return executor();
            },
            get data() {
                const callback = () => new Promise<T>((resolve, reject) => {
                    executors.raw
                        .then((res) => resolve(res.data))
                        .catch((err) => reject(err))
                });

                if(options?.cacheKey) return sdk.useCache(callback, options);

                return callback();
            },
            then: ((resolve, reject) => {
                return executors.data.then(resolve, reject);
            }) as Promise<T>["then"],
            catch: ((reject) => {
                return executors.data.catch(reject);
            }) as Promise<T>["catch"],
            finally: ((result) => {
                return executors.data.finally(result);
            }) as Promise<T>["finally"],
        };

        return executors;
    }
}
