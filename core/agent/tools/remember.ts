import { tool } from "ai";
import { z } from "zod";
import { join } from "@std/path/join";

let rememberQueue = Promise.resolve();
const memoryPath = join(Deno.cwd(), ".ai/memories.json");

export const rememberTool = tool({
  description:
    "Build memories for better performance and accuracy (Always use this tool remember important instructions)",
  inputSchema: z.object({
    content: z.string().describe("Memory to remember"),
  }),

  execute: async ({ content }) => {
    const operation = rememberQueue.then(async () => {
      const rawMemories = await Deno.readTextFile(memoryPath);
      const memories = JSON.parse(rawMemories) as string[];

      memories.push(content);

      const tmpPath = `${memoryPath}.${crypto.randomUUID()}.tmp`;

      try {
        await Deno.writeTextFile(
          tmpPath,
          JSON.stringify(memories),
        );

        await Deno.rename(tmpPath, memoryPath);
      } finally {
        await Deno.remove(tmpPath).catch(() => {});
      }
    });

    // Keep the queue alive even if this operation fails.
    rememberQueue = operation.catch(() => {});

    await operation;
  },
});

export const getMemoriesTool = tool({
  description:
    "Read the memories (Gives you all the memories, you should call this tool at least once before doing anything else)",
  inputSchema: z.object({}),
  execute: async () => await Deno.readTextFile(memoryPath),
});
