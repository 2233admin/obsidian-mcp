import type {
  CallToolResult,
  ServerContext,
  ToolAnnotations,
  ToolCallback
} from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { MAX_RESPONSE_CHARACTERS } from "../constants.js";
import type { ToolDefinition } from "../types.js";
import { asToolFailure, publicToolErrorSchema } from "./errors.js";

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

export function registerTool<Input extends z.ZodType, Data extends z.ZodType>(
  server: McpServer,
  definition: ToolDefinition<Input, Data>
): void {
  const outputSchema = toolResultSchema(definition.outputSchema);
  const handler = (async (
    input: z.output<Input>,
    context: ServerContext
  ): Promise<CallToolResult> => {
    try {
      const data = await definition.execute(input, { signal: context.mcpReq.signal });
      return {
        content: [{ type: "text", text: summarize(definition.title, data) }],
        structuredContent: { ok: true, data }
      };
    } catch (error) {
      const failure = asToolFailure(error, definition.title.toLocaleLowerCase());
      const structuredContent = outputSchema.parse({ ok: false, error: failure.toPublic() });
      return {
        isError: true,
        content: [{ type: "text", text: `${failure.code}: ${failure.message}` }],
        structuredContent
      };
    }
  }) as ToolCallback<Input>;

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

export function toolResultSchema<Data extends z.ZodType>(dataSchema: Data) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data: dataSchema }).strict(),
    z.object({ ok: z.literal(false), error: publicToolErrorSchema }).strict()
  ]);
}

function summarize(title: string, data: unknown): string {
  const text = `${title} succeeded.\n${JSON.stringify(data, null, 2)}`;
  return text.length <= MAX_RESPONSE_CHARACTERS
    ? text
    : `${text.slice(0, MAX_RESPONSE_CHARACTERS - 1)}…`;
}
