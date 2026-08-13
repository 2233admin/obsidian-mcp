// See README.md for production MCP host configuration. This compile-tested
// example shows the public CLI arguments without duplicating server internals.
export const exampleClientConfiguration = {
  mcpServers: {
    obsidian: {
      command: "obsidian-mcp",
      args: ["serve", "--vault", "notes=/absolute/path/to/vault"]
    }
  }
} as const;
