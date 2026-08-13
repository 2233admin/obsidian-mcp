import * as z from "zod";

import { DEFAULT_READ_CHARACTERS, MAX_RESPONSE_CHARACTERS } from "../../constants.js";
import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { ToolFailure } from "../../utils/errors.js";
import { relativePathSchema, vaultSchema } from "../../utils/schemas.js";
import { READ_ONLY } from "../../utils/tool-factory.js";

export const TOOL_NAME = "obsidian_read_note";

const inputSchema = z
  .object({
    vault: vaultSchema,
    path: relativePathSchema,
    cursor: z.string().max(2_048).optional(),
    max_chars: z.number().int().min(1).max(MAX_RESPONSE_CHARACTERS).default(DEFAULT_READ_CHARACTERS)
  })
  .strict();

export function createReadNoteTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Read Obsidian Note",
    description:
      "Read a bounded page of a UTF-8 Markdown note. Use the returned cursor to continue and etag before editing.",
    inputSchema,
    annotations: READ_ONLY,
    execute: async ({ vault, path: notePath, cursor, max_chars }) => {
      const service = runtime.forVault(vault);
      const entry = await service.fs.resolveExisting(notePath, { markdown: true });
      const read = await service.fs.readText(entry);
      const offset =
        cursor === undefined ? 0 : decodeReadCursor(cursor, entry.relativePath, read.etag);
      const content = read.text.slice(offset, offset + max_chars);
      const nextOffset = offset + content.length;
      return {
        path: entry.relativePath,
        content,
        etag: read.etag,
        total_characters: read.text.length,
        offset,
        has_more: nextOffset < read.text.length,
        ...(nextOffset < read.text.length
          ? { next_cursor: encodeReadCursor(entry.relativePath, read.etag, nextOffset) }
          : {})
      };
    }
  };
}

function encodeReadCursor(notePath: string, etag: string, offset: number): string {
  return Buffer.from(JSON.stringify({ version: 1, path: notePath, etag, offset })).toString(
    "base64url"
  );
}

function decodeReadCursor(cursor: string, notePath: string, etag: string): number {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      value.version !== 1 ||
      value.path !== notePath ||
      value.etag !== etag ||
      !Number.isSafeInteger(value.offset) ||
      Number(value.offset) < 0
    ) {
      throw new Error("Cursor mismatch");
    }
    return Number(value.offset);
  } catch (error) {
    throw new ToolFailure("INVALID_CURSOR", "Read cursor is invalid or the note has changed.", {
      cause: error
    });
  }
}
