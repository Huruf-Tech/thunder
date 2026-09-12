import { tool } from "ai";
import { z } from "zod";
import { join } from "@std/path/join";

export const readTextFileTool = tool({
  description: "Read the text content of a file",
  inputSchema: z.object({
    filePath: z.string().describe("The path to the file to read"),
  }),
  outputSchema: z.object({
    content: z.string().optional().describe("The content of the file"),
    error: z.string().optional().describe("File reading error"),
  }),
  execute: async ({ filePath }) => {
    try {
      const content = await Deno.readTextFile(join(Deno.cwd(), filePath));

      return { content };
    } catch (error) {
      return { error: String(error) };
    }
  },
});
