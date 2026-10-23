import { parse } from "@std/dotenv";
import { join } from "@std/path/join";
import { parseQueryParams } from "./parseQueryParams.ts";

export enum EnvType {
  DEVELOPMENT = "development",
  STAGING = "staging",
  PRODUCTION = "production",
  TEST = "test",
}

export class Env {
  private static configuration?: Record<string, string>;

  static onGetFailed?: (
    key: string,
  ) => Promise<string | null | undefined> | string | null | undefined;

  /**
   * Get the type of current environment (development, production, test etc.)
   */
  static getType() {
    const Target = (Deno.env.get("ENV_TYPE") ??
      Env.readEnvFile(".env").ENV_TYPE) as EnvType | undefined;

    return Target && Object.values(EnvType).includes(Target)
      ? Target
      : EnvType.PRODUCTION;
  }

  /**
   * Check environment.
   * @param type Type of environment (development, production, test etc.)
   * @returns
   */
  static is(...types: EnvType[]) {
    return types.includes(Env.getType());
  }

  /**
   * Get all environment variables
   * @returns
   */
  static getAll<T extends Record<string, string>>(): T {
    if (Env.configuration) return Env.configuration as T;

    // Real process env (e.g. secrets set by the hosting platform) wins over .env files
    return (Env.configuration = {
      ...Env.readEnvFile(".env"),
      ...Env.readEnvFile(`.env.${Env.getType()}`),
      ...Deno.env.toObject(),
    }) as T;
  }

  private static envFiles = new Map<string, Record<string, string>>();

  private static readEnvFile(name: string): Record<string, string> {
    let content = Env.envFiles.get(name);

    if (!content) {
      try {
        content = parse(Deno.readTextFileSync(join(Deno.cwd(), name)));
      } catch {
        content = {};
      }

      Env.envFiles.set(name, content);
    }

    return content;
  }

  /**
   * Asynchronously get a specific environment variable
   *
   * It is recommended to use get method instead of getSync because it makes a backup call (to a database or some other configured source) to ensure the availability of the environment variable.
   *
   * You can assign a custom backup method on Env.onGetFailed if it is not already assigned.
   * @param key Key of the variable
   * @returns
   */
  static async get<T extends string>(key: string): Promise<T>;

  /**
   * Asynchronously get a specific environment variable
   *
   * It is recommended to use get method instead of getSync because it makes a backup call (to a database or some other configured source) to ensure the availability of the environment variable.
   *
   * You can assign a custom backup method on Env.onGetFailed if it is not already assigned.
   * @param key Key of the variable
   * @param silent By passing `true` this function will not throw an error and instead it will return `undefined` if not found.
   */
  static async get<T extends string>(
    key: string,
    silent: true,
  ): Promise<T | undefined>;
  static async get(key: string, silent?: true) {
    let Data: string | null | undefined = Env.getAll()[key];

    if (typeof Data !== "string") {
      if (typeof Env.onGetFailed === "function") {
        Data = await Env.onGetFailed(key);
      }

      if (typeof Data !== "string") {
        if (silent) return;
        else throw new Error(`Missing environment variable '${key}'!`);
      }
    }

    return Data;
  }

  /**
   * Asynchronously get a specific environment variable and cast to boolean
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning a `boolean` if not found.
   * @returns
   */
  static async enabled(key: string, silent = true): Promise<boolean> {
    return ["true", "1"].includes(
      await this.get(key, silent as true) as string,
    );
  }

  /**
   * Asynchronously get a specific environment variable and cast to number
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning a `0 or NaN` if not found.
   * @returns
   */
  static async number<T extends number>(
    key: string,
    silent = true,
  ): Promise<T> {
    return Number(await this.get(key, silent as true)) as T;
  }

  /**
   * Asynchronously get a specific environment variable and cast to an array of string
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning an `empty array` if not found.
   * @returns
   */
  static async list<T extends string[]>(
    key: string,
    silent = true,
  ): Promise<T> {
    return ((await this.get(key, silent as true))?.split(/\s*,\s*/) ?? []) as T;
  }

  /**
   * Asynchronously get a specific environment variable and cast to a set of string
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning an `empty set` if not found.
   * @returns
   */
  static async listAsSet<T extends string>(
    key: string,
    silent = true,
  ): Promise<Set<T>> {
    return new Set<T>(await this.list<T[]>(key, silent));
  }

  /**
   * Asynchronously get a specific environment variable and cast to an object
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning an `empty object` if not found.
   * @returns
   */
  static async params<T extends Record<string, unknown>>(
    key: string,
    silent = true,
  ) {
    return parseQueryParams(await this.get(key, silent as true) ?? "") as T;
  }

  /**
   * Asynchronously get a specific environment variable and cast to an object
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning an `empty object` if not found.
   * @returns
   */
  static async json<T extends Record<string, unknown>>(
    key: string,
    silent = true,
  ) {
    return JSON.parse(await this.get(key, silent as true) ?? "{}") as T;
  }

  /**
   * Synchronously get a specific environment variable
   *
   * It is recommended to use get method instead of getSync because it makes a backup call (to a database or some other configured source) to ensure the availability of the environment variable.
   * @param key Key of the variable
   * @returns
   */
  static getSync<T extends string>(key: string): T;

  /**
   * Synchronously get a specific environment variable
   *
   * It is recommended to use get method instead of getSync because it makes a backup call (to a database or some other configured source) to ensure the availability of the environment variable.
   * @param key Key of the variable
   * @param silent By passing `true` this function will not throw an error and instead it will return `undefined` if not found.
   * @returns
   */
  static getSync<T extends string>(key: string, silent: true): T | undefined;
  static getSync(key: string, silent?: true) {
    const Value: string | null | undefined = Env.getAll()[key];

    if (typeof Value !== "string") {
      if (silent) return;
      else throw new Error(`Missing environment variable '${key}'!`);
    }

    return Value;
  }

  /**
   * Synchronously get a specific environment variable and cast to boolean
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning a `boolean` if not found.
   * @returns
   */
  static enabledSync(key: string, silent = true): boolean {
    return ["true", "1"].includes(this.getSync(key, silent as true) as string);
  }

  /**
   * Synchronously get a specific environment variable and cast to number
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning a `0 or NaN` if not found.
   * @returns
   */
  static numberSync<T extends number>(key: string, silent = true): T {
    return Number(this.getSync(key, silent as true)) as T;
  }

  /**
   * Synchronously get a specific environment variable and cast to an array of string
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning an `empty array` if not found.
   * @returns
   */
  static listSync<T extends string[]>(key: string, silent = true): T {
    return (this.getSync(key, silent as true)?.split(/\s*,\s*/) ?? []) as T;
  }

  /**
   * Synchronously get a specific environment variable and cast to a set of string
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning an `empty set` if not found.
   * @returns
   */
  static listAsSetSync<T extends string>(key: string, silent = true): Set<T> {
    return new Set<T>(this.listSync<T[]>(key, silent));
  }

  /**
   * Synchronously get a specific environment variable and cast to an object
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning an `empty object` if not found.
   * @returns
   */
  static paramsSync<T extends Record<string, unknown>>(
    key: string,
    silent = true,
  ) {
    return parseQueryParams(this.getSync(key, silent as true) ?? "") as T;
  }

  /**
   * Synchronously get a specific environment variable and cast to an object
   * @param key Key of the variable
   * @param silent By passing `false` this function will throw an error instead of returning an `empty object` if not found.
   * @returns
   */
  static jsonSync<T extends Record<string, unknown>>(
    key: string,
    silent = true,
  ) {
    return JSON.parse(this.getSync(key, silent as true) ?? "{}") as T;
  }
}
