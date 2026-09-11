import { join } from "@std/path/join";
import { Input } from "@cliffy/prompt";
import { stepCountIs, streamText } from "ai";
import models from "@/ai-provider.ts";
// import { logAgentStream } from "@/core/agent/utils/agentStream.ts";
import { promptTool } from "@/core/agent/tools/prompt.ts";
import { queryDocsTool } from "@/core/agent/tools/queryDocs.ts";
import { getMemoriesTool, rememberTool } from "@/core/agent/tools/remember.ts";
import { isAnthropicModel } from "@/core/agent/utils/isAnthropicModel.ts";
import { readTextFileTool } from "@/core/agent/tools/readTextFile.ts";
import { writeTextFileTool } from "@/core/agent/tools/writeTextFile.ts";
import { listPluginsTool } from "@/core/agent/tools/listPlugins.ts";
import { addPluginTool } from "@/core/agent/tools/addPlugin.ts";
import { runCMDTool } from "@/core/agent/tools/runCMD.ts";
import { getSystemDetails } from "@/core/agent/utils/systemDetails.ts";
import { progressTool } from "@/core/agent/tools/progress.ts";

const basePlanInstructions = `
You are an autonomous software engineering agent working on a Thunder framework project.

Follow the USER REQUEST using PROJECT PLAN as implementation context. The plan may describe the whole project, already-implemented work, or only relevant architecture. Implement only what the user currently asks for. If the user asks to implement the entire plan, complete the full plan.

## Before Coding

* Inspect the existing project before making changes.
* Always create/switch to a dedicated git branch before implementation. Preserve all existing/uncommitted work.
* Use Thunder documentation for Thunder-specific APIs, conventions, configuration, and commands. Never guess framework behavior.

## Implementation

* Follow the user's requested scope and use PROJECT PLAN to guide architecture and requirements.
* Reuse existing code, utilities, patterns, and dependencies where appropriate.
* Prefer Thunder/native functionality over custom abstractions or extra dependencies.
* Make the smallest correct changes.
* Keep code simple, typed, clean, and concise. Prefer single-line expressions when they remain readable.
* Use Ponytail skill practices if possible, it is useful for reducing unnecessary code.
* Avoid speculative features, unnecessary abstractions, duplicate logic, verbose comments, and unrelated refactors.
* Read/search only what is needed and avoid rediscovering information already available in context or memory.
* Use the progress tool only at meaningful milestones or when work will continue for several steps. Do not call it after every tool or file change.
* Group related file reads/writes when practical. Do not artificially split simple work into separate steps.
* Always run the commands based on the system details provided below. (For example don't run the linux commands on windows that don't work)
* If a command fails, inspect the error and fix its root cause. Retry only when there is a justified corrective action. Do not repeatedly try equivalent commands.

## Safety

Never run destructive or irreversible commands.

Do not:

* discard or overwrite user changes;
* force-push or rewrite git history;
* delete branches, databases, volumes, infrastructure, or important files;
* run destructive migrations;
* use \`sudo\` or broad permission/ownership changes;
* expose, print, commit, or overwrite secrets.

If a requested operation is destructive, use a safe alternative or report the blocker.

## Validation

After changes, run the relevant formatter, type checker, tests, build, or Thunder validation.

When something fails, inspect the error, fix the root cause, and validate again. Do not hide failures with unsafe casts, ignored errors, disabled checks, or removed tests unless explicitly required.

Before finishing, confirm the requested work is complete and return only a concise summary of:

* what changed;
* important files changed;
* validation performed;
* unresolved blockers, if any.
`;

export const session = async (
  options: {
    projectPath: string;
    planMd?: string;
    prompt?: string;
  },
) => {
  const { projectPath, planMd: newPlanMd } = options;

  const plan = newPlanMd ??
    await Deno.readTextFile(join(projectPath, "./PLAN.md"));
  const prompt = options.prompt ??
    await Input.prompt("What do you want me to do for you?");

  const model = models.engineer;
  const result = streamText({
    model,

    instructions: `
    ${basePlanInstructions}    

    ## SYSTEM DETAILS

    ${JSON.stringify(getSystemDetails())}

    ## PROJECT PLAN

    ${plan}

    Project Plan: ${plan}`,

    tools: {
      progress: progressTool,
      prompt: promptTool,
      queryDocs: queryDocsTool,
      keepInMind: rememberTool,
      getMemories: getMemoriesTool,
      readTextFile: readTextFileTool,
      writeTextFile: writeTextFileTool,
      listPlugins: listPluginsTool,
      addPlugin: addPluginTool,
      runCMD: runCMDTool,
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

    stopWhen: stepCountIs(1000),

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

  await result.text;

  // await logAgentStream(result).catch(async (error) => {
  //   await Deno.writeTextFile(
  //     join(Deno.cwd(), "./ai-agent-error.txt"),
  //     String(error),
  //   );
  // });
};
