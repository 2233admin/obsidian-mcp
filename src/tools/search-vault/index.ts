import * as z from "zod";

import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from "../../constants.js";
import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { relativePathSchema, vaultSchema } from "../../utils/schemas.js";
import { searchVault } from "../../utils/search.js";
import { READ_ONLY } from "../../utils/tool-factory.js";

export const TOOL_NAME = "obsidian_search_vault";

const inputSchema = z
  .object({
    vault: vaultSchema,
    query: z.string().min(1).max(1_000),
    scope: relativePathSchema.optional(),
    mode: z.enum(["content", "filename", "both", "tag"]).default("content"),
    case_sensitive: z.boolean().default(false),
    limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).default(DEFAULT_SEARCH_LIMIT),
    cursor: z.string().max(4_096).optional()
  })
  .strict();

export function createSearchVaultTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Search Obsidian Vault",
    description:
      "Search filenames, content, or Obsidian tags with deterministic bounded pagination.",
    inputSchema,
    annotations: READ_ONLY,
    execute: async ({ vault, query, scope, mode, case_sensitive, limit, cursor }, context) => {
      const service = runtime.forVault(vault);
      const result = await searchVault(service.fs, {
        query,
        mode,
        caseSensitive: case_sensitive,
        limit,
        signal: context.signal,
        ...(scope === undefined ? {} : { scope }),
        ...(cursor === undefined ? {} : { cursor })
      });
      return {
        matches: result.matches,
        count: result.matches.length,
        has_more: result.hasMore,
        ...(result.nextCursor === undefined ? {} : { next_cursor: result.nextCursor }),
        warnings: result.warnings
      };
    }
  };
}
