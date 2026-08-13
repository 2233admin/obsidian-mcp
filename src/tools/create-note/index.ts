import { promises as fs } from "node:fs";
import path from "node:path";

import * as z from "zod";

import { MAX_CONTENT_BYTES } from "../../constants.js";
import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { ToolFailure } from "../../utils/errors.js";
import { sha256 } from "../../utils/hash.js";
import { relativePathSchema, vaultSchema } from "../../utils/schemas.js";
import { CREATE } from "../../utils/tool-factory.js";
import { assertByteLimit } from "../../utils/validation.js";

export const TOOL_NAME = "obsidian_create_note";

const inputSchema = z
  .object({
    vault: vaultSchema,
    path: relativePathSchema,
    content: z.string().max(MAX_CONTENT_BYTES).default(""),
    create_parents: z.boolean().default(true)
  })
  .strict();

export function createCreateNoteTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Create Obsidian Note",
    description:
      "Atomically create a Markdown note without overwriting an existing file. Parent directories are optional.",
    inputSchema,
    annotations: CREATE,
    execute: async ({ vault, path: notePath, content, create_parents }) => {
      assertByteLimit(content);
      const service = runtime.forVault(vault);
      const entry = await service.fs.resolveNew(notePath, { markdown: true });
      if (!create_parents && !(await directoryExists(path.dirname(entry.absolutePath)))) {
        throw new ToolFailure("NOTE_NOT_FOUND", "The parent directory does not exist.");
      }
      const transactionId = await service.transactions.run([
        {
          kind: "write",
          path: entry.absolutePath,
          data: Buffer.from(content),
          requireMissing: true
        }
      ]);
      return { path: entry.relativePath, etag: sha256(content), transaction_id: transactionId };
    }
  };
}

async function directoryExists(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}
