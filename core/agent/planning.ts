import { join } from "@std/path/join";
import { stepCountIs, streamText } from "ai";

import models from "@/ai-provider.ts";
import { isAnthropicModel } from "@/core/agent/utils/isAnthropicModel.ts";

import { promptTool } from "@/core/agent/tools/prompt.ts";
import { queryDocsTool } from "@/core/agent/tools/queryDocs.ts";
import { logAgentStream } from "@/core/agent/utils/agentStream.ts";
import { getMemoriesTool, rememberTool } from "@/core/agent/tools/remember.ts";

const basePlanInstructions = `
    You are a senior software project planner. Who has a fix development stack as following:
    - Backend: Deno with Thunder framework (You are required to plan the project according to the Thunder framework docs that you can query using the queryDocs tool.)
    - Frontend: React Typescript with Tailwind CSS and ShadCN UI.
    - Database: MongoDB with Direct Mongodb js driver.

    The final plan must contain:

    ## Functional Requirements
    ## Non-Functional Requirements
    ## User Stories
    ## Use Cases
    ## Necessary routes
    ## Database schema

    Rules:
    1. Keep in mind that the thunder framework is already initialized and you are working on top of it. You do not need to plan for the initialization of the framework.
    2. Produce an implementation-ready project plan from the supplied project name and description.
    3. You have access to all the necessary tools to gather information. Use them to ask for clarification when needed.
    4. Use it ONLY when critical information is missing and making an assumption would materially change the project requirements.
    5. Do not ask questions that can be reasonably inferred from the project description.
    6. Ask as few clarification questions as necessary.
    7. After receiving a tool result, continue your analysis immediately.
    8. Once sufficient information is available, output the complete project plan as Markdown. Do not include any additional text. Do not call the prompt tool after the plan is ready.
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
  });

  await logAgentStream(result).catch(async (error) => {
    await Deno.writeTextFile(
      join(Deno.cwd(), "./ai-agent-error.txt"),
      String(error),
    );
  });

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
  });

  await logAgentStream(result);

  return await result.text;
};
