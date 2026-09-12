import { createOpenAI } from "@ai-sdk/openai";
import { ModelProvider } from "@/core/agent/types.ts";
import { Env } from "@/core/utils/env.ts";

const openai = createOpenAI({
  apiKey: Env.getSync("OPENAI_API_KEY"),
});

export default {
  architect: openai("gpt-6-astra"),
  engineer: openai("gpt-5.6-sol"),
  helper: openai("gpt-5.6-sol"),
  embedder: openai.embedding("text-embedding-3-large"),
} satisfies ModelProvider;
