import * as z from "zod";

import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { etagSchema, relativePathSchema, vaultSchema } from "../../utils/schemas.js";
import { normalizeTag, renameTag } from "../../utils/tags.js";
import { MUTATE } from "../../utils/tool-factory.js";
import type { PlannedChange } from "../../utils/transaction.js";
import { assertExpectedMap } from "../../utils/validation.js";

export const TOOL_NAME = "obsidian_rename_tag";

const inputSchema = z
  .object({
    vault: vaultSchema,
    old_tag: z.string().min(1).max(200),
    new_tag: z.string().min(1).max(200),
    location: z.enum(["frontmatter", "content", "both"]).default("both"),
    include_children: z.boolean().default(false),
    normalization: z.enum(["preserve", "lowercase", "kebab"]).default("preserve"),
    expected_etags: z.record(relativePathSchema, etagSchema).optional()
  })
  .strict();

export function createRenameTagTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Rename Obsidian Tag",
    description: "Rename a tag across a vault in one journaled all-or-nothing transaction.",
    inputSchema,
    annotations: MUTATE,
    execute: async ({
      vault,
      old_tag,
      new_tag,
      location,
      include_children,
      normalization,
      expected_etags
    }) => {
      normalizeTag(old_tag, normalization);
      normalizeTag(new_tag, normalization);
      const service = runtime.forVault(vault);
      const changes: PlannedChange[] = [];
      const updated: { path: string; replacements: number }[] = [];
      for (const entry of await service.fs.listMarkdown()) {
        const read = await service.fs.readText(entry);
        assertExpectedMap(expected_etags, entry.relativePath, read.etag);
        const result = renameTag(read.text, old_tag, new_tag, {
          location,
          includeChildren: include_children,
          normalization
        });
        if (result.replacements > 0) {
          changes.push({
            kind: "write",
            path: entry.absolutePath,
            data: Buffer.from(result.text),
            expectedEtag: read.etag
          });
          updated.push({ path: entry.relativePath, replacements: result.replacements });
        }
      }
      if (changes.length === 0) return { updated, transaction_id: null };
      return { updated, transaction_id: await service.transactions.run(changes) };
    }
  };
}
