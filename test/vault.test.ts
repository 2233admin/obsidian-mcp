import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

import { ToolFailure } from "../src/utils/errors.js";
import { VaultFs, VaultRegistry } from "../src/utils/vault.js";
import { createVault } from "./helpers.js";

test("vault path boundary rejects traversal and reserved roots", async () => {
  const root = await createVault();
  const registry = await VaultRegistry.create([{ id: "test", root }]);
  const vault = new VaultFs(registry.get("test"));

  for (const candidate of [
    "../outside.md",
    "folder/../outside.md",
    "/tmp/outside.md",
    "C:/outside.md",
    ".obsidian/app.json",
    ".obsidian-mcp/x"
  ]) {
    assert.throws(() => vault.normalizeRelative(candidate), ToolFailure, candidate);
  }
});

test("vault path boundary rejects symlinks", async () => {
  const root = await createVault();
  const outside = await fs.mkdtemp(path.join(path.dirname(root), "outside-"));
  await fs.writeFile(path.join(outside, "secret.md"), "secret");
  await fs.symlink(outside, path.join(root, "linked"));
  const registry = await VaultRegistry.create([{ id: "test", root }]);
  const vault = new VaultFs(registry.get("test"));

  await assert.rejects(
    () => vault.resolveExisting("linked/secret.md"),
    (error: unknown) => {
      return error instanceof ToolFailure && error.code === "SYMLINK_NOT_ALLOWED";
    }
  );
  assert.deepEqual(await vault.listMarkdown(), []);
});

test("vault registry rejects overlapping real roots", async () => {
  const root = await createVault();
  const nested = path.join(root, "nested");
  await fs.mkdir(path.join(nested, ".obsidian"), { recursive: true });
  await assert.rejects(
    () =>
      VaultRegistry.create([
        { id: "outer", root },
        { id: "inner", root: nested }
      ]),
    /overlap/u
  );
});

test("new files verify the nearest existing ancestor", async () => {
  const root = await createVault();
  const registry = await VaultRegistry.create([{ id: "test", root }]);
  const vault = new VaultFs(registry.get("test"));
  const entry = await vault.resolveNew("nested/new.md");
  assert.equal(entry.relativePath, "nested/new.md");
  assert.equal(entry.absolutePath, path.join(registry.get("test").root, "nested", "new.md"));
});
