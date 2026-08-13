import type { McpServer } from "@modelcontextprotocol/server";

import type { Runtime } from "../runtime.js";
import { registerVaultResource } from "./vault/index.js";

export function registerResources(server: McpServer, runtime: Runtime): void {
  registerVaultResource(server, runtime);
}
