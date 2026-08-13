import * as z from "zod";

import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { MUTATE } from "../../utils/tool-factory.js";
import {
  addTagFields,
  executeTagMutation,
  removeTagFields,
  tagMutationOutputSchema
} from "../shared/tag-mutation.js";

export const TOOL_NAME = "obsidian_manage_tags";

const inputSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("add").meta({ description: "Add tags to the selected notes" }),
      ...addTagFields
    })
    .strict(),
  z
    .object({
      operation: z.literal("remove").meta({ description: "Remove tags from the selected notes" }),
      ...removeTagFields
    })
    .strict()
    .refine((value) => value.tags.length > 0 || value.patterns.length > 0, {
      path: ["tags"],
      error: "At least one tag or pattern is required for a remove operation."
    })
]);

export function createManageTagsTool(
  runtime: Runtime
): ToolDefinition<typeof inputSchema, typeof tagMutationOutputSchema> {
  return {
    name: TOOL_NAME,
    title: "Manage Obsidian Tags",
    description:
      "Add or remove tags using the same transactional implementation as the dedicated tag tools.",
    inputSchema,
    outputSchema: tagMutationOutputSchema,
    annotations: MUTATE,
    execute: (input) => executeTagMutation(runtime, input.operation, input)
  };
}
