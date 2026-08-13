import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export async function createVault(prefix = "obsidian-mcp-test-"): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.mkdir(path.join(root, ".obsidian"));
  return root;
}
