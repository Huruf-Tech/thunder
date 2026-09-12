import { stepCountIs, streamText } from "ai";

import models from "@/ai-provider.ts";
import { isAnthropicModel } from "@/core/agent/utils/isAnthropicModel.ts";

import { promptTool } from "@/core/agent/tools/prompt.ts";
import { queryDocsTool } from "@/core/agent/tools/queryDocs.ts";
// import { logAgentStream } from "@/core/agent/utils/agentStream.ts";
import { getMemoriesTool, rememberTool } from "@/core/agent/tools/remember.ts";

const basePlanInstructions = `
    You are a senior software project planner. Produce an implementation-ready plan from the supplied project name and description.

    Stack:

    * Backend: Deno + Thunder, already initialized; exclude framework setup.
    * Frontend, if requested: React + TypeScript + Tailwind CSS + shadcn/ui.
    * Database: MongoDB using the official JavaScript driver directly; no ODM.

    Planning rules:

    1. Use \`queryDocs\` to verify Thunder-specific architecture, APIs, conventions, and best practices. Prefer documented plugins, utilities, and existing project logic over custom implementations. Never invent framework capabilities; flag anything unverified.
      * You can query docs multiple times to clear all your questions and gather as much information as possible.
      * Keep your question small for each query. Because queryDocs will only give you a limited answer for each question, so try query multiple times.
    2. Inspect relevant project context when available. Account for existing functionality and plan only the requested scope.
    3. If frontend scope is unspecified, ask whether it is required. Otherwise, use \`prompt\` only for missing information that materially changes scope or architecture and cannot reasonably be inferred. Minimize questions, group related questions, and state reasonable assumptions.
    4. Continue planning after each tool result. Once sufficient information is available, stop asking questions and produce the complete plan.
    5. Keep the plan concise, specific, and internally consistent. Avoid boilerplate, duplicate requirements, speculative features, and unsupported targets.

    Include these Markdown sections:

    ## Functional Requirements

    Group by feature; specify actors, permissions, business rules, validation, and important failure cases. Identify relevant Thunder components to reuse.

    ## Non-Functional Requirements

    Define applicable security, performance, reliability, observability, and testing requirements. Distinguish confirmed targets from proposed assumptions.

    ## User Stories

    Use “As a…, I want…, so that…” with testable acceptance criteria linked to functional requirements.

    ## Use Cases

    Describe key workflows: actor, preconditions, main steps, alternative/error paths, and outcome. Reference requirements instead of repeating them.

    ## Necessary Routes

    List API methods, paths, purpose, authorization, request/response shapes, and key errors. Include frontend routes only when frontend development is requested.

    ## Database Schema

    Define collections, field types, required/optional fields, defaults, validation, relationships, indexes, uniqueness constraints, and relevant data lifecycle rules.

    Output only the complete Markdown plan. Do not implement code or call any tool after the plan is ready.
    `;

export const planning = async (
  projectName: string,
  projectDescription: string,
) => {
  const model = models.architect;
  const result = streamText({
    model,

    instructions: basePlanInstructions,

    tools: {
      prompt: promptTool,
      queryDocs: queryDocsTool,
      keepInMind: rememberTool,
      getMemories: getMemoriesTool,
    },

    timeout: {
      stepMs: 180_000,
      chunkMs: 60_000,
    },

    messages: [
      {
        role: "user",
        content: `
        Project Name: ${projectName}
        Project Description: ${projectDescription}
        `,
        ...(isAnthropicModel(model)
          ? {
            providerOptions: {
              anthropic: {
                cacheControl: {
                  type: "ephemeral",
                },
              },
            },
          }
          : {}),
      },
    ],

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
      console.log(`[AI] tool started: ${toolCall.toolName}`, toolCall.input);
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

    onError({ error }) {
      console.error("[AI] error:", error);
    },
  });

  // await logAgentStream(result).catch(async (error) => {
  //   await Deno.writeTextFile(
  //     join(Deno.cwd(), "./ai-agent-error.txt"),
  //     String(error),
  //   );
  // });

  return await result.text;
};

export const reviewPlan = async (
  plan: string,
  prompt: string,
) => {
  const model = models.architect;
  const result = streamText({
    model,

    instructions: `
    ${basePlanInstructions}

    **Review the following plan you created earlier**:
    ${plan}
    `,

    tools: {
      prompt: promptTool,
      queryDocs: queryDocsTool,
      keepInMind: rememberTool,
      getMemories: getMemoriesTool,
    },

    timeout: {
      stepMs: 180_000,
      chunkMs: 60_000,
    },

    messages: [
      {
        role: "user",
        content: prompt,
        ...(isAnthropicModel(model)
          ? {
            providerOptions: {
              anthropic: {
                cacheControl: {
                  type: "ephemeral",
                },
              },
            },
          }
          : {}),
      },
    ],

    stopWhen: stepCountIs(10),

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
      console.log(`[AI] tool started: ${toolCall.toolName}`, toolCall.input);
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

    onError({ error }) {
      console.error("[AI] error:", error);
    },
  });

  // await logAgentStream(result);

  return await result.text;
};
