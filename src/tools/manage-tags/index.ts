import * as z from "zod";

import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { MUTATE } from "../../utils/tool-factory.js";
import { addTagFields, executeTagMutation, removeTagFields } from "../shared/tag-mutation.js";

export const TOOL_NAME = "obsidian_manage_tags";

const inputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("add"), ...addTagFields }).strict(),
  z
    .object({ operation: z.literal("remove"), ...removeTagFields })
    .strict()
    .refine((value) => value.tags.length > 0 || value.patterns.length > 0, {
      message: "At least one tag or pattern is required."
    })
]);

export function createManageTagsTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Manage Obsidian Tags",
    description:
      "Add or remove tags using the same transactional implementation as the dedicated tag tools.",
    inputSchema,
    annotations: MUTATE,
    execute: (input) => executeTagMutation(runtime, input.operation, input)
  };
}
