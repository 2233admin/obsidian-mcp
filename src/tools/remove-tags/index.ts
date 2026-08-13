import * as z from "zod";

import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { MUTATE } from "../../utils/tool-factory.js";
import {
  executeTagMutation,
  removeTagFields,
  tagMutationOutputSchema
} from "../shared/tag-mutation.js";

export const TOOL_NAME = "obsidian_remove_tags";

const inputSchema = z
  .object(removeTagFields)
  .strict()
  .refine((value) => value.tags.length > 0 || value.patterns.length > 0, {
    path: ["tags"],
    error: "At least one tag or pattern is required for a remove operation."
  });

export function createRemoveTagsTool(
  runtime: Runtime
): ToolDefinition<typeof inputSchema, typeof tagMutationOutputSchema> {
  return {
    name: TOOL_NAME,
    title: "Remove Obsidian Tags",
    description:
      "Remove tags in one all-or-nothing multi-note transaction while preserving unrelated content.",
    inputSchema,
    outputSchema: tagMutationOutputSchema,
    annotations: MUTATE,
    execute: (input) => executeTagMutation(runtime, "remove", input)
  };
}
