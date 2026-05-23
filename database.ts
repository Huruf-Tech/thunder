import { Env } from "@/core/utils/env.ts";
import { MongoClient, MongoError, MongoServerError } from "mongodb";

export const mongodb = new MongoClient(Env.getSync("DATABASE_URL"), {
  maxPoolSize: 30,
  waitQueueTimeoutMS: 10000,
});

export function hasMongoErrorLabel(
  error: unknown,
  label: string,
): boolean {
  return (
    error instanceof MongoError &&
    typeof error.hasErrorLabel === "function" &&
    error.hasErrorLabel(label)
  );
}

export function isTransientTransactionError(error: unknown): boolean {
  return hasMongoErrorLabel(error, "TransientTransactionError");
}

export function isUnknownTransactionCommitResult(error: unknown): boolean {
  return hasMongoErrorLabel(error, "UnknownTransactionCommitResult");
}

export function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}
