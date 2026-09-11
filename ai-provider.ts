// import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { ModelProvider } from "@/core/agent/types.ts";
import { Env } from "@/core/utils/env.ts";

// const anthropic = createAnthropic({
//   apiKey: Env.getSync("ANTHROPIC_API_KEY"),
// });

const google = createGoogle({
  apiKey: Env.getSync("GOOGLE_AI_API_KEY"),
});

const openai = createOpenAI({
  apiKey: Env.getSync("OPENAI_API_KEY"),
});

export default {
  // architect: anthropic("claude-opus-4-5"),
  // engineer: anthropic("claude-sonnet-5"),
  // helper: anthropic("claude-sonnet-5"),
  architect: openai("gpt-6-astra"),
  engineer: openai("gpt-5.6-luna"),
  helper: openai("gpt-5-codex"),
  embedder: google.embedding("gemini-embedding-001"),
} satisfies ModelProvider;
