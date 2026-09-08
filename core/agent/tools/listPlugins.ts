import { tool } from "ai";
import { z } from "zod";
import { listPlugins } from "@/core/lib/listPlugins.ts";

export const listPluginsTool = tool({
  description: "Lists all available thunder framework plugins",
  inputSchema: z.object({}),
  execute: async () => {
    const plugins = await listPlugins();

    return { plugins };
  },
});
