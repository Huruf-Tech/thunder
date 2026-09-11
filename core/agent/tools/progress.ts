import { tool } from "ai";
import { z } from "zod";

export const progressTool = tool({
  description: "Report your progress back to the user",
  inputSchema: z.object({
    progress: z.string().describe("What you are doing or about todo"),
  }),
  execute: ({ progress }) => {
    console.log("Agent Says:", progress);
  },
});
