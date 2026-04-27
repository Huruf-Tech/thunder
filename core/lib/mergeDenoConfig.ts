import { deepMergeUnique } from "@/core/scripts/lib/utility.ts";

export const mergeDenoConfig = (
  src: Record<PropertyKey, unknown>,
  target: Record<PropertyKey, unknown>,
) => {
  const ResultConfig = deepMergeUnique(src, target);

  delete ResultConfig.id;
  delete ResultConfig.version;
  delete ResultConfig.title;
  delete ResultConfig.description;
  delete ResultConfig.homepage;
  delete ResultConfig.icon;
  delete ResultConfig.author;
  delete ResultConfig.keywords;
  delete ResultConfig.donate;

  return {
    ...src,
    ...ResultConfig,
  };
};
