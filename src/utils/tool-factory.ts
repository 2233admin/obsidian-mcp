import type {
  CallToolResult,
  StandardSchemaWithJSON,
  ToolAnnotations,
  ToolCallback
} from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { MAX_RESPONSE_CHARACTERS } from "../constants.js";
import type { ToolData, ToolDefinition } from "../types.js";
import { asToolFailure } from "./errors.js";

const errorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

const outputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ ok: z.literal(false), error: errorSchema }).strict()
]);

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

export const CREATE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
};

export const MUTATE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
};

export function registerTool<Input extends StandardSchemaWithJSON>(
  server: McpServer,
  definition: ToolDefinition<Input>
): void {
  const handler = (async (
    input: StandardSchemaWithJSON.InferOutput<Input>,
    context: { signal: AbortSignal }
  ): Promise<CallToolResult> => {
    try {
      const data = await definition.execute(input, context);
      const structuredContent = { ok: true, data };
      return {
        content: [{ type: "text", text: summarize(definition.title, data) }],
        structuredContent
      };
    } catch (error) {
      const failure = asToolFailure(error, definition.title.toLocaleLowerCase());
      const structuredContent = { ok: false, error: failure.toPublic() };
      return {
        isError: true,
        content: [{ type: "text", text: `${failure.code}: ${failure.message}` }],
        structuredContent
      };
    }
  }) as unknown as ToolCallback<Input>;

  server.registerTool(
    definition.name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema,
      annotations: definition.annotations
    },
    handler
  );
}

function summarize(title: string, data: ToolData): string {
  const text = `${title} succeeded.\n${JSON.stringify(data, null, 2)}`;
  return text.length <= MAX_RESPONSE_CHARACTERS
    ? text
    : `${text.slice(0, MAX_RESPONSE_CHARACTERS - 1)}…`;
}
