import { Env, EnvType } from "./env.ts";

export enum LogType {
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  SUCCESS = "success",
}

export class Logger {
  protected static log(
    type: LogType,
    nativeLogFunction: (...args: unknown[]) => void,
    ...args: unknown[]
  ) {
    if (!Env.is(EnvType.PRODUCTION)) {
      return nativeLogFunction(`[${type}] ${new Date()}:`, ...args);
    }
  }

  static info(...args: unknown[]) {
    return this.log(LogType.INFO, console.info, ...args);
  }

  static warn(...args: unknown[]) {
    return this.log(LogType.WARN, console.warn, ...args);
  }

  static error(...args: unknown[]) {
    return this.log(LogType.ERROR, console.error, ...args);
  }

  static success(...args: unknown[]) {
    return this.log(LogType.SUCCESS, console.log, ...args);
  }
}
