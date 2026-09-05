import { generateText } from "ai";
import { promptTool } from "@/core/agent/tools/prompt.ts";

export const planning = async (
  projectName: string,
  projectDescription: string,
) => {
  const result = await generateText({
    model: "google/gemini-3.5-flash",
    instructions: `
    You are a project planning assistant. Your task is to help create a comprehensive project plan based on the provided project name and description. The plan should include the following sections:
    1. Functional Requirements and Non-Functional Requirements
    2. User Stories and Use Cases

    Once you have generated the plan, please return it in a markdown format. Ensure that the plan is clear, concise, and well-structured.
    `,
    tools: {
      prompt: promptTool,
    },
    prompt: `
    Project Name: ${projectName}
    Project Description: ${projectDescription}`,
  });

  console.log("Generated Plan:", result.content);

  return "";
};
