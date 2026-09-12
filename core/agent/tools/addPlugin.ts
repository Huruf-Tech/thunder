import { tool } from "ai";
import { z } from "zod";
import { addPlugin } from "@/core/scripts/addPlugin.ts";

export const addPluginTool = tool({
  description: "Add a thunder framework plugin",
  inputSchema: z.object({
    name: z.string().describe(
      "A github repository name. E.g: Huruf-Tech/thunder-core",
    ),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("If the plugin was added successfully"),
    error: z.string().optional().describe("If unable to add a plugin"),
  }),
  execute: async ({ name }) => {
    try {
      await addPlugin({
        name,
        setup: true,
        prompt: false,
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
});
