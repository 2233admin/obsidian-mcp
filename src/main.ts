#!/usr/bin/env node
import process from "node:process";

import { StdioServerTransport, serveStdio } from "@modelcontextprotocol/server/stdio";

import {
  DEFAULT_RECOVERY_BYTES,
  DEFAULT_RECOVERY_DAYS,
  MAX_VAULTS,
  SERVER_VERSION
} from "./constants.js";
import { Runtime } from "./runtime.js";
import { buildServer } from "./server.js";
import { Logger, type LogLevel } from "./utils/logger.js";
import { VaultRegistry, type VaultDefinition } from "./utils/vault.js";

interface CliOptions {
  command: "serve" | "doctor" | "recovery-list" | "recovery-restore";
  vaults: VaultDefinition[];
  recoveryDays: number;
  recoveryMaxBytes: number;
  logLevel: LogLevel;
  recoveryId?: string;
}

async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed === "help") {
    process.stdout.write(helpText());
    return;
  }
  if (parsed === "version") {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }

  const logger = new Logger(parsed.logLevel);
  const registry = await VaultRegistry.create(parsed.vaults);
  const runtime = new Runtime(
    registry,
    { recoveryDays: parsed.recoveryDays, recoveryMaxBytes: parsed.recoveryMaxBytes },
    logger
  );
  await runtime.initialize();

  if (parsed.command === "doctor") {
    process.stdout.write(
      `${JSON.stringify({ ok: true, vaults: await runtime.doctor() }, null, 2)}\n`
    );
    return;
  }
  if (parsed.command === "recovery-list") {
    const result = Object.fromEntries(
      await Promise.all(
        registry
          .ids()
          .map(async (id) => [id, await runtime.forVault(id).transactions.listRecovery()] as const)
      )
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (parsed.command === "recovery-restore") {
    if (parsed.recoveryId === undefined) throw new Error("recovery restore requires --id.");
    if (registry.ids().length !== 1)
      throw new Error("recovery restore requires exactly one --vault.");
    const vaultId = registry.ids()[0];
    if (vaultId === undefined) throw new Error("Missing vault.");
    const transactionId = await runtime
      .forVault(vaultId)
      .transactions.restoreRecovery(parsed.recoveryId);
    process.stdout.write(
      `${JSON.stringify({ ok: true, transaction_id: transactionId }, null, 2)}\n`
    );
    return;
  }

  const transport = new StdioServerTransport(process.stdin, process.stdout, {
    maxBufferSize: 10 * 1024 * 1024
  });
  const handle = serveStdio(() => buildServer(runtime), {
    legacy: "reject",
    transport,
    onerror: (error) => logger.log("error", "stdio_error", { message: error.message })
  });
  logger.log("info", "server_started", { vaults: registry.ids(), version: SERVER_VERSION });
  let closing = false;
  const close = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.log("info", "server_stopping", { signal });
    await handle.close();
  };
  process.once("SIGINT", () => void close("SIGINT"));
  process.once("SIGTERM", () => void close("SIGTERM"));
}

function parseArguments(args: string[]): CliOptions | "help" | "version" {
  if (args.includes("--help") || args[0] === "help") return "help";
  if (args.includes("--version")) return "version";
  const first = args.shift();
  let command: CliOptions["command"];
  if (first === "serve" || first === "doctor") command = first;
  else if (first === "recovery") {
    const recoveryCommand = args.shift();
    if (recoveryCommand === "list") command = "recovery-list";
    else if (recoveryCommand === "restore") command = "recovery-restore";
    else throw new Error("Expected 'recovery list' or 'recovery restore'.");
  } else throw new Error("Expected 'serve', 'doctor', 'recovery list', or 'recovery restore'.");

  const vaults: VaultDefinition[] = [];
  let recoveryDays = DEFAULT_RECOVERY_DAYS;
  let recoveryMaxBytes = DEFAULT_RECOVERY_BYTES;
  let logLevel: LogLevel = "info";
  let recoveryId: string | undefined;
  while (args.length > 0) {
    const flag = args.shift();
    const value = args.shift();
    if (value === undefined) throw new Error(`Missing value for ${flag}.`);
    if (flag === "--vault") vaults.push(parseVault(value));
    else if (flag === "--recovery-days") recoveryDays = parsePositiveInteger(value, flag);
    else if (flag === "--recovery-max-bytes") recoveryMaxBytes = parsePositiveInteger(value, flag);
    else if (flag === "--log-level" && isLogLevel(value)) logLevel = value;
    else if (flag === "--id") recoveryId = value;
    else throw new Error(`Unknown option '${flag}'.`);
  }
  if (vaults.length > MAX_VAULTS)
    throw new Error(`At most ${MAX_VAULTS} vaults may be configured.`);
  return {
    command,
    vaults,
    recoveryDays,
    recoveryMaxBytes,
    logLevel,
    ...(recoveryId === undefined ? {} : { recoveryId })
  };
}

function parseVault(value: string): VaultDefinition {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error("--vault must use the form id=/absolute/path.");
  }
  return { id: value.slice(0, separator), root: value.slice(separator + 1) };
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

function isLogLevel(value: string): value is LogLevel {
  return value === "error" || value === "warn" || value === "info" || value === "debug";
}

function helpText(): string {
  return `obsidian-mcp ${SERVER_VERSION}

Usage:
  obsidian-mcp serve --vault <id>=<absolute-path> [--vault ...]
  obsidian-mcp doctor --vault <id>=<absolute-path> [--vault ...]
  obsidian-mcp recovery list --vault <id>=<absolute-path> [--vault ...]
  obsidian-mcp recovery restore --vault <id>=<absolute-path> --id <transaction-id>

Options:
  --vault <id>=<path>          Configure one vault (required, repeatable, maximum 10)
  --recovery-days <days>       Completed journal retention (default: 30)
  --recovery-max-bytes <bytes> Recovery storage limit (default: 1073741824)
  --log-level <level>          error, warn, info, or debug
  --help                       Show help
  --version                    Show version
`;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`obsidian-mcp: ${message}\n`);
  process.exitCode = 1;
});
