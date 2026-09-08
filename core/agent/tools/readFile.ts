import { tool } from "ai";
import { z } from "zod";
import { join } from "@std/path/join";

export const readFileTool = tool({
  description: "Read the content of a file",
  inputSchema: z.object({
    filePath: z.string().describe("The path to the file to read"),
  }),
  outputSchema: z.object({
    content: z.string().describe("The content of the file"),
  }),
  execute: async ({ filePath }) => {
    try {
      const content = await Deno.readTextFile(join(Deno.cwd(), filePath));

      return { content };
    } catch {
      return { content: "" };
    }
  },
});
