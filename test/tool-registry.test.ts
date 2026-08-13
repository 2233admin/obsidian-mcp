import assert from "node:assert/strict";
import test from "node:test";

import { Runtime } from "../src/runtime.js";
import { createToolDefinitions, TOOL_NAMES } from "../src/tools/index.js";
import { Logger } from "../src/utils/logger.js";
import { VaultRegistry } from "../src/utils/vault.js";
import { createVault } from "./helpers.js";

test("tool registry is complete, ordered, and composed from unique definition factories", async () => {
  const root = await createVault("obsidian-mcp-registry-");
  const registry = await VaultRegistry.create([{ id: "test", root }]);
  const runtime = new Runtime(
    registry,
    { recoveryDays: 30, recoveryMaxBytes: 1024 * 1024 },
    new Logger("error")
  );
  await runtime.initialize();

  const definitions = createToolDefinitions(runtime);
  const names = definitions.map((definition) => definition.name);
  assert.deepEqual(names, [...TOOL_NAMES]);
  assert.equal(new Set(names).size, TOOL_NAMES.length);
  for (const definition of definitions) {
    assert.ok(definition.title);
    assert.ok(definition.description);
    assert.ok(definition.inputSchema);
    assert.equal(typeof definition.execute, "function");
    assert.equal(typeof definition.annotations.readOnlyHint, "boolean");
    assert.equal(typeof definition.annotations.destructiveHint, "boolean");
    assert.equal(typeof definition.annotations.idempotentHint, "boolean");
    assert.equal(typeof definition.annotations.openWorldHint, "boolean");
  }
});
