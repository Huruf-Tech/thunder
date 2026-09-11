import { tool } from "ai";
import { z } from "zod";
import { sh } from "@/core/scripts/lib/sh.ts";
import { Confirm } from "@cliffy/prompt";

export const runCMDTool = tool({
  description: "Run multiple shell commands",
  inputSchema: z.object({
    cmds: z.string().array().array().describe(
      "List of commands to run as an array of string of a single CMD to run. E.g: [['git', 'clone', '...'], [...]]",
    ),
  }),
  outputSchema: z.object({
    results: z.object({
      executed: z.boolean().describe(
        "If the command was executed successfully",
      ),
      cmd: z.string().array(),
      result: z.string().optional().describe("Result of the command execution"),
      error: z.unknown().optional().describe(
        "Error while executing the command",
      ),
    }).array(),
  }),
  execute: async ({ cmds }) => {
    const run = async (cmd: string[]) => {
      try {
        const confirm = await Confirm.prompt(
          `Do you want to allow executing the command: "${cmd.join(" ")}"`,
        );

        if (!confirm) throw new Error("User denied to execute the command!");

        const result = await sh(cmd, Deno.cwd());

        return { executed: true, cmd, result };
      } catch (error) {
        return { executed: false, cmd, error };
      }
    };

    const results: Array<
      { executed: boolean; cmd: string[]; result?: string; error?: unknown }
    > = [];

    for (const cmd of cmds) {
      results.push(await run(cmd));
    }

    console.log("Results:", results);

    await Confirm.prompt("Continue...");

    return {
      results,
    };
  },
});
