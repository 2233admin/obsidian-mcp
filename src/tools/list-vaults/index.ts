import * as z from "zod";

import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { READ_ONLY } from "../../utils/tool-factory.js";

export const TOOL_NAME = "obsidian_list_vaults";

const inputSchema = z.object({}).strict();

export function createListVaultsTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "List Obsidian Vaults",
    description:
      "List configured vault ids accepted by every other Obsidian tool. Returns no host paths.",
    inputSchema,
    annotations: READ_ONLY,
    execute: () => {
      const vaults = runtime.registry.ids();
      return Promise.resolve({ vaults, count: vaults.length });
    }
  };
}
