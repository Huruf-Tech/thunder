import { tool } from "ai";
import { z } from "zod";

import { Checkbox, Confirm, Input, Select } from "@cliffy/prompt";

const promptItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("question"),
    message: z.string(),
  }),

  z.object({
    type: z.literal("confirmation"),
    message: z.string(),
  }),

  z.object({
    type: z.literal("options"),
    message: z.string(),
    options: z.array(z.string()).min(1),
  }),

  z.object({
    type: z.literal("checklist"),
    message: z.string(),
    options: z.array(z.string()).min(1),
  }),
]);

export const promptTool = tool({
  description: `
    Ask the user one or more clarification questions.

    IMPORTANT:
    - Make only ONE call to this tool per planning step.
    - If multiple questions are needed, include all of them in "prompts".
    - The questions will be presented sequentially to the user.
  `,

  inputSchema: z.object({
    prompts: z.array(promptItemSchema).min(1),
  }),

  outputSchema: z.object({
    answers: z.array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    ),
  }),

  execute: async ({ prompts }) => {
    const answers: Array<{
      question: string;
      answer: string;
    }> = [];

    for (const prompt of prompts) {
      switch (prompt.type) {
        case "question": {
          const answer = await Input.prompt(prompt.message);

          answers.push({
            question: prompt.message,
            answer,
          });

          break;
        }

        case "confirmation": {
          const confirmed = await Confirm.prompt(prompt.message);

          answers.push({
            question: prompt.message,
            answer: confirmed ? "yes" : "no",
          });

          break;
        }

        case "options": {
          const answer = await Select.prompt({
            message: prompt.message,
            options: prompt.options,
          });

          answers.push({
            question: prompt.message,
            answer,
          });

          break;
        }

        case "checklist": {
          const selected = await Checkbox.prompt({
            message: prompt.message,
            options: prompt.options,
          });

          answers.push({
            question: prompt.message,
            answer: selected.join(", "),
          });

          break;
        }
      }
    }

    return {
      answers,
    };
  },
});
