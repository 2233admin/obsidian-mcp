import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { Logger } from "../src/utils/logger.js";
import { TransactionManager } from "../src/utils/transaction.js";
import { VaultRegistry, sha256 } from "../src/utils/vault.js";
import { createVault } from "./helpers.js";

const run = promisify(execFile);

test("startup failures never write non-MCP output to stdout", async () => {
  await assert.rejects(
    () => run(process.execPath, ["dist/main.js", "serve", "--vault", "bad=/does/not/exist"]),
    (error: unknown) => {
      const failure = error as Error & { stdout?: string; stderr?: string };
      assert.equal(failure.stdout, "");
      assert.match(failure.stderr ?? "", /obsidian-mcp:/u);
      return true;
    }
  );
});

test("doctor and recovery CLI commands operate on an explicit vault", async () => {
  const root = await createVault("obsidian-mcp-cli-");
  const doctor = await run(process.execPath, [
    "dist/main.js",
    "doctor",
    "--vault",
    `test=${root}`,
    "--log-level",
    "error"
  ]);
  const diagnosis = JSON.parse(doctor.stdout) as {
    ok: boolean;
    vaults: { vault: string }[];
  };
  assert.equal(diagnosis.ok, true);
  assert.equal(diagnosis.vaults[0]?.vault, "test");

  const registry = await VaultRegistry.create([{ id: "test", root }]);
  const target = path.join(registry.get("test").root, "note.md");
  await fs.writeFile(target, "before");
  const manager = new TransactionManager(
    registry.get("test"),
    { recoveryDays: 30, recoveryMaxBytes: 1024 * 1024 },
    new Logger("error")
  );
  await manager.initialize();
  const id = await manager.run([
    { kind: "write", path: target, data: Buffer.from("after"), expectedEtag: sha256("before") }
  ]);

  const restored = await run(process.execPath, [
    "dist/main.js",
    "recovery",
    "restore",
    "--vault",
    `test=${root}`,
    "--id",
    id,
    "--log-level",
    "error"
  ]);
  assert.equal((JSON.parse(restored.stdout) as { ok: boolean }).ok, true);
  assert.equal(await fs.readFile(target, "utf8"), "before");
});
