import { tool } from "ai";
import { z } from "zod";

import { Checkbox, Confirm, Input, Select } from "@cliffy/prompt";

export enum PromptType {
  QUESTION = "question",
  CONFIRMATION = "confirmation",
  OPTIONS = "options",
  CHECKLIST = "checklist",
}

export const promptTool = tool({
  description:
    "Take instructions from the user. The instructions can be anything, such as a question, a confirmation, or a selection of options.",
  inputSchema: z.object({
    type: z.enum(PromptType).describe(
      "The type of instruction from the user.",
    ),
    message: z.string().describe("The question or instruction for the user."),
    options: z.string().array().optional().describe(
      "The options for the user to choose from, if applicable.",
    ),
    checklist: z.string().array().optional().describe(
      "A list of items for the user to select from, if applicable.",
    ),
  }),
  outputSchema: z.object({
    answer: z.string().describe("The user's answer or response."),
  }),
  execute: async ({ type, message, options, checklist }) => {
    switch (type) {
      case PromptType.QUESTION: {
        const answer = await Input.prompt(message);
        return { answer };
      }
      case PromptType.CONFIRMATION: {
        const confirmed = await Confirm.prompt(message);
        return { answer: confirmed ? "yes" : "no" };
      }
      case PromptType.OPTIONS: {
        const selectedOption = await Select.prompt({
          message,
          options: options ?? [],
        });
        return { answer: selectedOption };
      }
      case PromptType.CHECKLIST: {
        const selectedItem = await Checkbox.prompt({
          message,
          options: checklist ?? [],
        });
        return { answer: selectedItem.join(", ") };
      }
      default:
        throw new Error(`Unhandled type: ${type}`);
    }
  },
});
