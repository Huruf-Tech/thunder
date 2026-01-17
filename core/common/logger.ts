import { Env, EnvType } from "./env.ts";

export enum LogType {
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  SUCCESS = "success",
}

const COLORS: Record<LogType, string> = {
  [LogType.INFO]: "\x1b[34m", // Blue
  [LogType.WARN]: "\x1b[33m", // Yellow
  [LogType.ERROR]: "\x1b[31m", // Red
  [LogType.SUCCESS]: "\x1b[32m", // Green
};

const RESET = "\x1b[0m";

export class Logger {
  protected static log(
    type: LogType,
    nativeLogFunction: (...args: unknown[]) => void,
    ...args: unknown[]
  ) {
    if (Env.is(EnvType.PRODUCTION)) return;

    const color = COLORS[type];
    const timestamp = new Date().toISOString();

    return nativeLogFunction(
      `${color}${timestamp} ${type.toUpperCase()}:`,
      ...args,
      RESET,
    );
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
