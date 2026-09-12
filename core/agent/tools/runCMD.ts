import { join } from "@std/path/join";
import { dirname } from "@std/path/dirname";
import { tool } from "ai";
import { z } from "zod";
import { sh } from "@/core/scripts/lib/sh.ts";
import { Confirm } from "@cliffy/prompt";

const getAllowedList = async (allowedListPath: string) => {
  const rawAllowedList = await Deno.readTextFile(allowedListPath).catch(() =>
    "[]"
  );
  return JSON.parse(rawAllowedList) as string[];
};

const pushAllowedList = async (
  allowedListPath: string,
  cmds: string[],
  existingList?: string[],
) => {
  const list = existingList ?? await getAllowedList(allowedListPath);

  list.push(...cmds);

  await Deno.mkdir(dirname(allowedListPath), { recursive: true }).catch(
    console.error,
  );

  await Deno.writeTextFile(
    allowedListPath,
    JSON.stringify(Array.from(new Set(list))),
  );
};

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
      error: z.string().optional().describe(
        "Error while executing the command",
      ),
    }).array(),
  }),
  execute: async ({ cmds }) => {
    const allowedListPath = join(Deno.cwd(), "./.ai/allowed-cmds.json");
    const allowed = await getAllowedList(allowedListPath);

    const run = async (cmd: string[]) => {
      try {
        const fullCmd = cmd.join(" ");

        const confirm = allowed.includes(fullCmd) || await Confirm.prompt(
          `Do you want to allow executing the command: "${fullCmd}"`,
        );

        if (!confirm) throw new Error("User denied to execute the command!");

        await pushAllowedList(allowedListPath, [fullCmd], allowed);

        const result = await sh(cmd, Deno.cwd());

        return { executed: true, cmd, result };
      } catch (error) {
        return { executed: false, cmd, error: String(error) };
      }
    };

    const results: Array<
      { executed: boolean; cmd: string[]; result?: string; error?: string }
    > = [];

    for (const cmd of cmds) {
      results.push(await run(cmd));
    }

    return {
      results,
    };
  },
});
