import { tool } from "ai";
import { z } from "zod";
import { join } from "@std/path/join";

export const writeTextFileTool = tool({
  description: "Write the text content in a file",
  inputSchema: z.object({
    filePath: z.string().describe("The path to the file to read"),
    content: z.string().describe("The text contents of the file"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("If the file was written successfully"),
    error: z.string().optional().describe("File writing error"),
  }),
  execute: async ({ filePath, content }) => {
    try {
      await Deno.writeTextFile(join(Deno.cwd(), filePath), content);

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
});
