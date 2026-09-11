import { LocalIndex } from "vectra";
import { embed, embedMany, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { Confirm } from "@cliffy/prompt";

import models from "@/ai-provider.ts";
import { readTextFileTool } from "@/core/agent/tools/readTextFile.ts";
import { listPluginsTool } from "@/core/agent/tools/listPlugins.ts";

let indexPromise: Promise<void> | null = null;

export const queryDocsTool = tool({
  description: "Query the docs for Thunder framework.",
  inputSchema: z.object({
    query: z.string().describe(
      "The query string to search in the docs",
    ),
  }),
  outputSchema: z.object({
    contents: z.string().array().describe(
      "The contents of the docs that match the query (as an array of string)",
    ),
  }),
  execute: async ({ query }) => {
    console.log("Querying docs for:", query);

    const vectra = new LocalIndex("./.ai/vectra/docs");

    if (!(await vectra.isIndexCreated())) {
      const indexDocs = async () => {
        const createIndex = await Confirm.prompt(
          "The vectra index is not created yet. Do you want to create it now?",
        );

        if (!createIndex) {
          return;
        }

        // Load all the docs files and create chunks using AI
        const result = await generateText({
          model: models.helper ?? models.engineer ?? models.architect,
          instructions: `
            You are a senior software engineer.

            Read the provided documentation files and split them into semantically meaningful chunks that will later be used to store in a vector db and will be needed as a documentation for the LLM to code according to the Thunder framework rules.

            Chunking Rules:

            llms-full.txt is instruction/reference only. Use it to understand how to navigate/read the docs. NEVER chunk its content.
            Use listPlugins to discover available plugins and read their relevant documentation when needed.
            If a doc references another relevant file, read it too.
            Each chunk must be a complete thought or idea.
            Do include the provided example code snippets.
            Max 200 words per chunk. (Strictly)

            Return ONLY valid JSON array of chunk string (For example your response should look like):

            [
                "...",
                "..."
            ]

            **Strictly follow this**: No Markdown fences, No explanations, No comments, No headings, or No extra text. Each item must contain only content property. The entire response must be directly parsable with JSON.parse(). Return [] if there is nothing to chunk.
            `,
          tools: {
            readTextFile: readTextFileTool,
            listPlugins: listPluginsTool,
          },
          timeout: {
            stepMs: 180_000,
            chunkMs: 60_000,
          },
          prompt:
            "Go ahead read: llms-full.txt, than read all the reference files found in llms-full.txt (Like: llms.txt, llms.extension.txt and others etc) and give me the json",

          stopWhen: stepCountIs(100),

          experimental_onStepStart({ stepNumber }) {
            console.log(`[AI] step ${stepNumber} started`);
          },

          onStepFinish({ stepNumber, finishReason, usage }) {
            console.log(`[AI] step ${stepNumber} finished`, {
              finishReason,
              usage,
            });
          },

          experimental_onToolCallStart({ toolCall }) {
            console.log(
              `[AI] tool started: ${toolCall.toolName}`,
              toolCall.input,
            );
          },

          experimental_onToolCallFinish({ toolCall, toolExecutionMs }) {
            console.log(`[AI] tool finished: ${toolCall.toolName}`, {
              toolExecutionMs,
            });
          },

          onFinish({ finishReason, usage }) {
            console.log("[AI] agent finished", {
              finishReason,
              usage,
            });
          },
        }).catch((error) => {
          console.error(error);
          throw error;
        });

        console.info("Generating embeddings from:", result.text);

        const { values, embeddings } = await embedMany({
          model: models.embedder,
          values: JSON.parse(result.text) as string[],
        });

        await vectra.createIndex();

        for (let i = 0; i < values.length; i++) {
          vectra.insertItem({
            vector: embeddings[i],
            metadata: {
              content: values[i],
            },
          });
        }
      };

      indexPromise ??= indexDocs();

      await indexPromise;
    }

    const { embedding: vector } = await embed({
      model: models.embedder,
      value: query,
    });

    const matches = await vectra.queryItems(
      vector,
      query,
      5,
    );

    return {
      contents: matches.map((match) => match.item.metadata.content),
    };
  },
});
