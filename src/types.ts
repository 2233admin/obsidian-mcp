import type { StandardSchemaWithJSON, ToolAnnotations } from "@modelcontextprotocol/server";

export type ToolData = Record<string, unknown>;

export interface ToolDefinition<Input extends StandardSchemaWithJSON> {
  name: string;
  title: string;
  description: string;
  inputSchema: Input;
  annotations: ToolAnnotations;
  execute: (
    input: StandardSchemaWithJSON.InferOutput<Input>,
    context: { signal: AbortSignal }
  ) => Promise<ToolData>;
}
