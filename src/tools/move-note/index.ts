import * as z from "zod";

import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { ToolFailure } from "../../utils/errors.js";
import { planLinkUpdates } from "../../utils/links.js";
import { etagSchema, relativePathSchema, vaultSchema } from "../../utils/schemas.js";
import { MUTATE } from "../../utils/tool-factory.js";
import { assertIfMatch } from "../../utils/validation.js";

export const TOOL_NAME = "obsidian_move_note";

const inputSchema = z
  .object({
    vault: vaultSchema,
    source: relativePathSchema,
    destination: relativePathSchema,
    update_links: z.boolean().default(true),
    if_match: etagSchema.optional()
  })
  .strict();

export function createMoveNoteTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Move Obsidian Note",
    description:
      "Move or rename a note within one vault without overwriting and transactionally update unambiguous backlinks.",
    inputSchema,
    annotations: MUTATE,
    execute: async ({ vault, source, destination, update_links, if_match }) => {
      const service = runtime.forVault(vault);
      const from = await service.fs.resolveExisting(source, { markdown: true });
      const to = await service.fs.resolveNew(destination, { markdown: true });
      if (from.relativePath === to.relativePath) {
        throw new ToolFailure("INVALID_ARGUMENT", "Source and destination are identical.");
      }
      const read = await service.fs.readText(from);
      assertIfMatch(if_match, read.etag);
      const links = update_links
        ? await planLinkUpdates(service.fs, from.relativePath, to.relativePath, "move")
        : { changes: [], updatedFiles: [], ambiguousLinks: 0 };
      const transactionId = await service.transactions.run([
        { kind: "write", path: to.absolutePath, data: read.bytes, requireMissing: true },
        { kind: "delete", path: from.absolutePath, expectedEtag: read.etag },
        ...links.changes
      ]);
      return {
        source: from.relativePath,
        destination: to.relativePath,
        etag: read.etag,
        updated_backlinks: links.updatedFiles,
        ambiguous_links: links.ambiguousLinks,
        transaction_id: transactionId
      };
    }
  };
}
