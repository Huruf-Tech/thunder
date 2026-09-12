import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { ModelProvider } from "@/core/agent/types.ts";
import { Env } from "@/core/utils/env.ts";

const anthropic = createAnthropic({
  apiKey: Env.getSync("ANTHROPIC_API_KEY"),
});

const openai = createOpenAI({
  apiKey: Env.getSync("OPENAI_API_KEY"),
});

export default {
  architect: anthropic("claude-fable-5-1"),
  engineer: anthropic("claude-opus-5"),
  helper: openai("gpt-5.6-sol"),
  embedder: openai.embedding("text-embedding-3-large"),
} satisfies ModelProvider;
