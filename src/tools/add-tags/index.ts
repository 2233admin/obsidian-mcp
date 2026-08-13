import * as z from "zod";

import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { MUTATE } from "../../utils/tool-factory.js";
import { addTagFields, executeTagMutation } from "../shared/tag-mutation.js";

export const TOOL_NAME = "obsidian_add_tags";

const inputSchema = z.object(addTagFields).strict();

export function createAddTagsTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Add Obsidian Tags",
    description:
      "Add tags in one all-or-nothing multi-note transaction while preserving unrelated content.",
    inputSchema,
    annotations: MUTATE,
    execute: (input) => executeTagMutation(runtime, "add", input)
  };
}
