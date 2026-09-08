import { EmbeddingModel, LanguageModel } from "ai";

export enum ModelType {
  ARCHITECT = "architect",
  ENGINEER = "engineer",
  HELPER = "helper",
  EMBEDDER = "embedder",
}
export type ModelProvider = {
  [ModelType.ARCHITECT]: LanguageModel;
  [ModelType.ENGINEER]?: LanguageModel;
  [ModelType.HELPER]?: LanguageModel;
  [ModelType.EMBEDDER]?: EmbeddingModel;
};
