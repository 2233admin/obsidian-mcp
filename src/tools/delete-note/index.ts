import { randomUUID } from "node:crypto";
import path from "node:path";

import * as z from "zod";

import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { ToolFailure } from "../../utils/errors.js";
import { planLinkUpdates } from "../../utils/links.js";
import { etagSchema, relativePathSchema, vaultSchema } from "../../utils/schemas.js";
import { MUTATE } from "../../utils/tool-factory.js";
import type { PlannedChange } from "../../utils/transaction.js";
import { assertIfMatch } from "../../utils/validation.js";

export const TOOL_NAME = "obsidian_delete_note";

const inputSchema = z
  .object({
    vault: vaultSchema,
    path: relativePathSchema,
    mode: z.enum(["trash", "permanent"]).default("trash"),
    reason: z.string().max(1_000).optional(),
    backlink_action: z.enum(["preserve", "mark_broken"]).default("preserve"),
    if_match: etagSchema.optional(),
    confirm_path: relativePathSchema.optional()
  })
  .strict();

export function createDeleteNoteTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Delete Obsidian Note",
    description:
      "Transactionally move a note to MCP trash or permanently delete it. Backlinks are preserved unless mark_broken is requested.",
    inputSchema,
    annotations: MUTATE,
    execute: async ({
      vault,
      path: notePath,
      mode,
      reason,
      backlink_action,
      if_match,
      confirm_path
    }) => {
      const service = runtime.forVault(vault);
      const entry = await service.fs.resolveExisting(notePath, { markdown: true });
      const read = await service.fs.readText(entry);
      assertIfMatch(if_match, read.etag);
      if (mode === "permanent" && confirm_path !== entry.relativePath) {
        throw new ToolFailure(
          "INVALID_ARGUMENT",
          `Permanent deletion requires confirm_path '${entry.relativePath}'.`
        );
      }
      const links =
        backlink_action === "mark_broken"
          ? await planLinkUpdates(service.fs, entry.relativePath, undefined, "mark_broken")
          : { changes: [], updatedFiles: [], ambiguousLinks: 0 };
      const changes: PlannedChange[] = [...links.changes];
      let trashId: string | undefined;
      if (mode === "trash") {
        trashId = randomUUID();
        const trashBase = path.join(service.vault.stateRoot, "trash", trashId);
        changes.push(
          { kind: "write", path: `${trashBase}.md`, data: read.bytes, requireMissing: true },
          {
            kind: "write",
            path: `${trashBase}.json`,
            data: Buffer.from(
              JSON.stringify({
                original_path: entry.relativePath,
                deleted_at: new Date().toISOString(),
                reason
              })
            ),
            requireMissing: true
          }
        );
      }
      changes.push({
        kind: "delete",
        path: entry.absolutePath,
        expectedEtag: read.etag,
        retainSnapshot: mode !== "permanent"
      });
      const transactionId = await service.transactions.run(changes);
      return {
        path: entry.relativePath,
        mode,
        ...(trashId === undefined ? {} : { trash_id: trashId }),
        updated_backlinks: links.updatedFiles,
        ambiguous_links: links.ambiguousLinks,
        transaction_id: transactionId
      };
    }
  };
}
