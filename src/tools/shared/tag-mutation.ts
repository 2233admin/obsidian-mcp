import * as z from "zod";

import { MAX_BATCH_PATHS, MAX_TAGS } from "../../constants.js";
import type { Runtime } from "../../runtime.js";
import type { ToolData } from "../../types.js";
import { mutateTags, type TagLocation, type TagNormalization } from "../../utils/tags.js";
import type { PlannedChange } from "../../utils/transaction.js";
import { assertExpectedMap, unique } from "../../utils/validation.js";
import { etagSchema, relativePathSchema, vaultSchema } from "../../utils/schemas.js";

const tagsSchema = z.array(z.string().min(1).max(200)).max(MAX_TAGS);
const pathsSchema = z.array(relativePathSchema).min(1).max(MAX_BATCH_PATHS);
const locationSchema = z.enum(["frontmatter", "content", "both"]);
const normalizationSchema = z.enum(["preserve", "lowercase", "kebab"]);
const expectedEtagsSchema = z.record(relativePathSchema, etagSchema).optional();

export const addTagFields = {
  vault: vaultSchema,
  paths: pathsSchema,
  tags: tagsSchema.min(1),
  location: locationSchema.default("frontmatter"),
  position: z.enum(["start", "end"]).default("end"),
  normalization: normalizationSchema.default("preserve"),
  expected_etags: expectedEtagsSchema
};

export const removeTagFields = {
  vault: vaultSchema,
  paths: pathsSchema,
  tags: tagsSchema.default([]),
  patterns: z.array(z.string().min(1).max(200)).max(MAX_TAGS).default([]),
  location: locationSchema.default("both"),
  include_children: z.boolean().default(false),
  normalization: normalizationSchema.default("preserve"),
  expected_etags: expectedEtagsSchema
};

export interface TagMutationInput {
  vault: string;
  paths: string[];
  tags: string[];
  patterns?: string[] | undefined;
  location: TagLocation;
  position?: "start" | "end" | undefined;
  normalization: TagNormalization;
  include_children?: boolean | undefined;
  expected_etags?: Record<string, string> | undefined;
}

export async function executeTagMutation(
  runtime: Runtime,
  operation: "add" | "remove",
  input: TagMutationInput
): Promise<ToolData> {
  const service = runtime.forVault(input.vault);
  const changes: PlannedChange[] = [];
  const updated: { path: string; tags: string[] }[] = [];
  const paths = unique(input.paths);
  for (const requestedPath of paths) {
    const entry = await service.fs.resolveExisting(requestedPath, { markdown: true });
    const read = await service.fs.readText(entry);
    assertExpectedMap(input.expected_etags, entry.relativePath, read.etag);
    const result = mutateTags(read.text, {
      operation,
      tags: input.tags,
      location: input.location,
      normalization: input.normalization,
      ...(input.patterns === undefined ? {} : { patterns: input.patterns }),
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.include_children === undefined ? {} : { includeChildren: input.include_children })
    });
    if (result.text !== read.text) {
      changes.push({
        kind: "write",
        path: entry.absolutePath,
        data: Buffer.from(result.text),
        expectedEtag: read.etag
      });
      updated.push({ path: entry.relativePath, tags: result.changed });
    }
  }
  return {
    updated,
    unchanged_count: paths.length - updated.length,
    transaction_id: changes.length === 0 ? null : await service.transactions.run(changes)
  };
}
