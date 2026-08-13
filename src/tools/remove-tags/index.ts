import * as z from "zod";

import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { MUTATE } from "../../utils/tool-factory.js";
import { executeTagMutation, removeTagFields } from "../shared/tag-mutation.js";

export const TOOL_NAME = "obsidian_remove_tags";

const inputSchema = z
  .object(removeTagFields)
  .strict()
  .refine((value) => value.tags.length > 0 || value.patterns.length > 0, {
    message: "At least one tag or pattern is required."
  });

export function createRemoveTagsTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Remove Obsidian Tags",
    description:
      "Remove tags in one all-or-nothing multi-note transaction while preserving unrelated content.",
    inputSchema,
    annotations: MUTATE,
    execute: (input) => executeTagMutation(runtime, "remove", input)
  };
}
