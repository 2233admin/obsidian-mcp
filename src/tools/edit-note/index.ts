import * as z from "zod";

import { MAX_CONTENT_BYTES } from "../../constants.js";
import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { sha256 } from "../../utils/hash.js";
import { etagSchema, relativePathSchema, vaultSchema } from "../../utils/schemas.js";
import { MUTATE } from "../../utils/tool-factory.js";
import { assertByteLimit, assertIfMatch } from "../../utils/validation.js";

export const TOOL_NAME = "obsidian_edit_note";

const inputSchema = z
  .object({
    vault: vaultSchema,
    path: relativePathSchema,
    operation: z.enum(["append", "prepend", "replace"]),
    content: z.string().max(MAX_CONTENT_BYTES),
    if_match: etagSchema.optional()
  })
  .strict();

export function createEditNoteTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Edit Obsidian Note",
    description:
      "Append, prepend, or replace note content byte-for-byte. This tool never deletes notes.",
    inputSchema,
    annotations: MUTATE,
    execute: async ({ vault, path: notePath, operation, content, if_match }) => {
      assertByteLimit(content);
      const service = runtime.forVault(vault);
      const entry = await service.fs.resolveExisting(notePath, { markdown: true });
      const read = await service.fs.readText(entry);
      assertIfMatch(if_match, read.etag);
      const next =
        operation === "replace"
          ? content
          : operation === "append"
            ? `${read.text}${content}`
            : `${content}${read.text}`;
      assertByteLimit(next);
      const transactionId = await service.transactions.run([
        {
          kind: "write",
          path: entry.absolutePath,
          data: Buffer.from(next),
          expectedEtag: read.etag
        }
      ]);
      return { path: entry.relativePath, etag: sha256(next), transaction_id: transactionId };
    }
  };
}
