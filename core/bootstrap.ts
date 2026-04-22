import { ZodType } from "zod";

ZodType.prototype.strictParse = function (
  ...args: Parameters<ZodType["parse"]>
) {
  return this.parse(...args);
};
