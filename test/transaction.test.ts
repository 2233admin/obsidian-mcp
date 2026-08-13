import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

import { Logger } from "../src/utils/logger.js";
import { TransactionManager } from "../src/utils/transaction.js";
import { VaultRegistry, sha256 } from "../src/utils/vault.js";
import { createVault } from "./helpers.js";

test("transaction commits multiple files and records recoverable revisions", async () => {
  const root = await createVault();
  const registry = await VaultRegistry.create([{ id: "test", root }]);
  const realRoot = registry.get("test").root;
  const first = path.join(realRoot, "first.md");
  const second = path.join(realRoot, "second.md");
  await fs.writeFile(first, "before");
  const manager = new TransactionManager(
    registry.get("test"),
    { recoveryDays: 30, recoveryMaxBytes: 1024 * 1024 },
    new Logger("error")
  );
  await manager.initialize();
  const id = await manager.run([
    { kind: "write", path: first, data: Buffer.from("after"), expectedEtag: sha256("before") },
    { kind: "write", path: second, data: Buffer.from("new"), requireMissing: true }
  ]);
  assert.equal(await fs.readFile(first, "utf8"), "after");
  assert.equal(await fs.readFile(second, "utf8"), "new");
  assert.ok(
    (await manager.listRecovery()).some((entry) => entry.id === id && entry.state === "committed")
  );
});

test("transaction preflight prevents partial changes", async () => {
  const root = await createVault();
  const registry = await VaultRegistry.create([{ id: "test", root }]);
  const realRoot = registry.get("test").root;
  const first = path.join(realRoot, "first.md");
  const second = path.join(realRoot, "second.md");
  await fs.writeFile(first, "before");
  await fs.writeFile(second, "exists");
  const manager = new TransactionManager(
    registry.get("test"),
    { recoveryDays: 30, recoveryMaxBytes: 1024 * 1024 },
    new Logger("error")
  );
  await manager.initialize();
  await assert.rejects(() =>
    manager.run([
      { kind: "write", path: first, data: Buffer.from("changed"), expectedEtag: sha256("before") },
      { kind: "write", path: second, data: Buffer.from("overwrite"), requireMissing: true }
    ])
  );
  assert.equal(await fs.readFile(first, "utf8"), "before");
  assert.equal(await fs.readFile(second, "utf8"), "exists");
  assert.deepEqual(await fs.readdir(path.join(realRoot, ".obsidian-mcp", "transactions")), []);
});

test("startup recovery restores only journal entries that may have applied", async () => {
  const root = await createVault();
  const registry = await VaultRegistry.create([{ id: "test", root }]);
  const vault = registry.get("test");
  const changed = path.join(vault.root, "changed.md");
  const untouched = path.join(vault.root, "untouched.md");
  await fs.writeFile(changed, "planned");
  await fs.writeFile(untouched, "external edit");

  const id = "11111111-1111-4111-8111-111111111111";
  const transactionRoot = path.join(vault.stateRoot, "transactions", id);
  await fs.mkdir(transactionRoot, { recursive: true });
  await fs.writeFile(path.join(transactionRoot, "0.bin"), "original");
  await fs.writeFile(
    path.join(transactionRoot, "manifest.json"),
    JSON.stringify({
      id,
      state: "committing",
      createdAt: new Date().toISOString(),
      snapshots: [
        {
          path: "changed.md",
          operation: "write",
          phase: "applying",
          existed: true,
          etag: sha256("original"),
          plannedEtag: sha256("planned"),
          snapshot: "0.bin",
          recoverable: true
        },
        {
          path: "untouched.md",
          operation: "write",
          phase: "pending",
          existed: true,
          etag: sha256("before"),
          plannedEtag: sha256("never written"),
          snapshot: "1.bin",
          recoverable: true
        }
      ]
    })
  );
  await fs.writeFile(path.join(transactionRoot, "1.bin"), "before");

  const manager = new TransactionManager(
    vault,
    { recoveryDays: 30, recoveryMaxBytes: 1024 * 1024 },
    new Logger("error")
  );
  await manager.initialize();

  assert.equal(await fs.readFile(changed, "utf8"), "original");
  assert.equal(await fs.readFile(untouched, "utf8"), "external edit");
  assert.equal(
    (await manager.listRecovery()).find((entry) => entry.id === id)?.state,
    "rolled_back"
  );
});

test("completed transaction can be restored when committed files are unchanged", async () => {
  const root = await createVault();
  const registry = await VaultRegistry.create([{ id: "test", root }]);
  const target = path.join(registry.get("test").root, "note.md");
  await fs.writeFile(target, "before");
  const manager = new TransactionManager(
    registry.get("test"),
    { recoveryDays: 30, recoveryMaxBytes: 1024 * 1024 },
    new Logger("error")
  );
  await manager.initialize();
  const original = await manager.run([
    { kind: "write", path: target, data: Buffer.from("after"), expectedEtag: sha256("before") }
  ]);
  const recovery = await manager.restoreRecovery(original);
  assert.notEqual(recovery, original);
  assert.equal(await fs.readFile(target, "utf8"), "before");
});

test("recursive directory creation and recovery are one journaled transaction", async () => {
  const root = await createVault();
  const registry = await VaultRegistry.create([{ id: "test", root }]);
  const vault = registry.get("test");
  const parent = path.join(vault.root, "parent");
  const child = path.join(parent, "child");
  const manager = new TransactionManager(
    vault,
    { recoveryDays: 30, recoveryMaxBytes: 1024 * 1024 },
    new Logger("error")
  );
  await manager.initialize();

  const id = await manager.run([
    { kind: "mkdir", path: parent },
    { kind: "mkdir", path: child }
  ]);
  assert.equal((await fs.stat(child)).isDirectory(), true);
  await manager.restoreRecovery(id);
  await assert.rejects(() => fs.access(parent));
});
