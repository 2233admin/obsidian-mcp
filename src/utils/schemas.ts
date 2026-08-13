import * as z from "zod";

export const vaultSchema = z
  .string()
  .min(1)
  .max(64)
  .describe("Configured vault id from obsidian_list_vaults");

export const relativePathSchema = z
  .string()
  .min(1)
  .max(4_096)
  .describe("Portable path relative to the vault root, using forward slashes");

export const etagSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u)
  .describe("SHA-256 revision returned by a read");
