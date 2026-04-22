import { core } from "zod";

declare module "zod" {
  interface ZodType {
    strictParse(
      data: core.input<this>,
      params?: core.ParseContext<core.$ZodIssue>,
    ): core.output<this>;
  }
}
