import { tool } from "ai";
import { z } from "zod";
import { sh } from "@/core/scripts/lib/sh.ts";
import { Confirm } from "@cliffy/prompt";

export const runCMDTool = tool({
  description: "Run shell commands",
  inputSchema: z.object({
    cmd: z.string().array().describe(
      "An array string of a single CMD to run. E.g: ['git', 'clone', '...']",
    ),
  }),
  outputSchema: z.object({
    executed: z.boolean().describe("If the command was executed successfully"),
    result: z.string().optional().describe("Result of the command execution"),
    error: z.unknown().optional().describe("Error while executing the command"),
  }),
  execute: async ({ cmd }) => {
    try {
      const confirm = await Confirm.prompt(
        `Do you want to allow executing the command: ${cmd.join(" ")}`,
      );

      if (!confirm) throw new Error("User denied to execute the command!");

      const result = await sh(cmd, Deno.cwd());

      return { executed: true, result };
    } catch (error) {
      return { executed: false, error };
    }
  },
});
