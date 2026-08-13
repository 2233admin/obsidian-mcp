import { promises as fs } from "node:fs";
import path from "node:path";

import * as z from "zod";

import type { Runtime } from "../../runtime.js";
import type { ToolDefinition } from "../../types.js";
import { ToolFailure } from "../../utils/errors.js";
import { relativePathSchema, vaultSchema } from "../../utils/schemas.js";
import { CREATE } from "../../utils/tool-factory.js";

export const TOOL_NAME = "obsidian_create_directory";

const inputSchema = z
  .object({
    vault: vaultSchema,
    path: relativePathSchema,
    recursive: z.boolean().default(true)
  })
  .strict();

export function createCreateDirectoryTool(runtime: Runtime): ToolDefinition<typeof inputSchema> {
  return {
    name: TOOL_NAME,
    title: "Create Obsidian Directory",
    description:
      "Transactionally create a directory inside a vault. Existing directories are rejected.",
    inputSchema,
    annotations: CREATE,
    execute: async ({ vault, path: directory, recursive }) => {
      const service = runtime.forVault(vault);
      const entry = await service.fs.resolveNew(directory);
      const missing: string[] = [];
      let current = service.vault.root;
      for (const component of entry.relativePath.split("/")) {
        current = path.join(current, component);
        try {
          const stat = await fs.lstat(current);
          if (!stat.isDirectory()) {
            throw new ToolFailure("ALREADY_EXISTS", "A file exists in the directory path.");
          }
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            missing.push(current);
          } else {
            throw error;
          }
        }
      }
      if (missing.length === 0) {
        throw new ToolFailure("ALREADY_EXISTS", "The directory already exists.");
      }
      if (!recursive && missing.length > 1) {
        throw new ToolFailure("NOTE_NOT_FOUND", "The parent directory does not exist.");
      }
      const transactionId = await service.transactions.run(
        missing.map((target) => ({ kind: "mkdir" as const, path: target }))
      );
      return { path: entry.relativePath, created: true, transaction_id: transactionId };
    }
  };
}
