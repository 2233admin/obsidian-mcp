import type { McpServer } from "@modelcontextprotocol/server";

import type { Runtime } from "../../runtime.js";

export function registerVaultResource(server: McpServer, runtime: Runtime): void {
  server.registerResource(
    "Configured Obsidian Vaults",
    "obsidian-mcp://vaults",
    {
      title: "Configured Obsidian Vaults",
      description: "Sanitized identifiers for vaults configured for this server process.",
      mimeType: "application/json",
      cacheHint: { ttlMs: 300_000, cacheScope: "private" }
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            vaults: runtime.registry.ids().map((id) => ({
              id,
              capabilities: ["read", "write", "search", "tags"]
            }))
          })
        }
      ]
    })
  );
}
