import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

import { INTERNAL_DIRECTORY, MAX_CONTENT_BYTES, RESERVED_ROOTS } from "../constants.js";
import { asToolFailure, isNodeError, ToolFailure } from "./errors.js";
import { sha256 } from "./hash.js";

export { sha256 } from "./hash.js";

export interface VaultDefinition {
  id: string;
  root: string;
}

export interface ResolvedVault {
  id: string;
  root: string;
  stateRoot: string;
}

export interface VaultEntry {
  relativePath: string;
  absolutePath: string;
}

const vaultIdPattern = /^[a-z][a-z0-9_-]{0,63}$/;
const windowsAbsolutePattern = /^(?:[a-zA-Z]:[\\/]|\\\\|\/\/)/;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export class VaultRegistry {
  private constructor(private readonly vaults: ReadonlyMap<string, ResolvedVault>) {}

  static async create(definitions: readonly VaultDefinition[]): Promise<VaultRegistry> {
    if (definitions.length === 0) throw new Error("At least one --vault is required.");
    const byId = new Map<string, ResolvedVault>();

    for (const definition of definitions) {
      if (!vaultIdPattern.test(definition.id)) {
        throw new Error(
          `Invalid vault id '${definition.id}'. Use a lowercase identifier beginning with a letter.`
        );
      }
      if (byId.has(definition.id)) throw new Error(`Duplicate vault id '${definition.id}'.`);
      if (!path.isAbsolute(definition.root)) {
        throw new Error(`Vault '${definition.id}' must use an absolute path.`);
      }

      const root = await fs.realpath(definition.root);
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) throw new Error(`Vault '${definition.id}' is not a directory.`);
      const obsidian = path.join(root, ".obsidian");
      if (!(await isDirectory(obsidian))) {
        throw new Error(`Vault '${definition.id}' does not contain a .obsidian directory.`);
      }
      await fs.access(root, fsConstants.R_OK | fsConstants.W_OK);
      byId.set(definition.id, {
        id: definition.id,
        root,
        stateRoot: path.join(root, INTERNAL_DIRECTORY)
      });
    }

    const roots = [...byId.values()];
    for (let left = 0; left < roots.length; left += 1) {
      for (let right = left + 1; right < roots.length; right += 1) {
        const a = roots[left];
        const b = roots[right];
        if (
          a !== undefined &&
          b !== undefined &&
          (contains(a.root, b.root) || contains(b.root, a.root))
        ) {
          throw new Error(`Vault roots '${a.id}' and '${b.id}' overlap.`);
        }
      }
    }
    return new VaultRegistry(byId);
  }

  get(id: string): ResolvedVault {
    const vault = this.vaults.get(id);
    if (vault === undefined) {
      throw new ToolFailure("VAULT_NOT_FOUND", `Vault '${id}' is not configured.`, {
        details: { available_vaults: this.ids() }
      });
    }
    return vault;
  }

  ids(): string[] {
    return [...this.vaults.keys()].sort();
  }

  values(): ResolvedVault[] {
    return [...this.vaults.values()];
  }
}

export class VaultFs {
  constructor(readonly vault: ResolvedVault) {}

  normalizeRelative(
    input: string,
    options: { markdown?: boolean; allowRoot?: boolean } = {}
  ): string {
    if (
      input.includes("\0") ||
      input.includes("\\") ||
      path.isAbsolute(input) ||
      windowsAbsolutePattern.test(input)
    ) {
      throw new ToolFailure("PATH_REJECTED", "Path must be a portable vault-relative path.");
    }
    let value = input;
    if (options.markdown === true && !value.toLowerCase().endsWith(".md")) value += ".md";
    const parts = value.split("/");
    if (
      (value.length === 0 && options.allowRoot !== true) ||
      parts.some((part) => part.length === 0 || part === "." || part === "..")
    ) {
      throw new ToolFailure("PATH_REJECTED", "Path cannot be empty or contain dot segments.");
    }
    const first = parts[0]?.toLowerCase();
    if (first !== undefined && RESERVED_ROOTS.has(first)) {
      throw new ToolFailure("PATH_REJECTED", `The '${first}' directory is reserved.`);
    }
    return parts.join("/");
  }

  async resolveExisting(
    relativePath: string,
    options: { markdown?: boolean } = {}
  ): Promise<VaultEntry> {
    const normalized = this.normalizeRelative(relativePath, options);
    const absolutePath = path.join(this.vault.root, ...normalized.split("/"));
    await this.assertComponentsSafe(absolutePath, true);
    return { relativePath: normalized, absolutePath };
  }

  async resolveNew(
    relativePath: string,
    options: { markdown?: boolean } = {}
  ): Promise<VaultEntry> {
    const normalized = this.normalizeRelative(relativePath, options);
    const absolutePath = path.join(this.vault.root, ...normalized.split("/"));
    await this.assertComponentsSafe(absolutePath, false);
    return { relativePath: normalized, absolutePath };
  }

  async exists(relativePath: string, options: { markdown?: boolean } = {}): Promise<boolean> {
    try {
      await this.resolveExisting(relativePath, options);
      return true;
    } catch (error) {
      if (error instanceof ToolFailure && error.code === "NOTE_NOT_FOUND") return false;
      throw error;
    }
  }

  async readBytes(entry: VaultEntry): Promise<Buffer> {
    try {
      const bytes = await fs.readFile(entry.absolutePath);
      if (bytes.byteLength > MAX_CONTENT_BYTES) {
        throw new ToolFailure("INPUT_TOO_LARGE", "Note exceeds the 5 MiB read limit.");
      }
      return bytes;
    } catch (error) {
      throw asToolFailure(error, "read the note");
    }
  }

  async readText(entry: VaultEntry): Promise<{ bytes: Buffer; text: string; etag: string }> {
    const bytes = await this.readBytes(entry);
    try {
      return { bytes, text: utf8Decoder.decode(bytes), etag: sha256(bytes) };
    } catch (error) {
      throw new ToolFailure("INVALID_ENCODING", "The note is not valid UTF-8.", { cause: error });
    }
  }

  async listMarkdown(scope = ""): Promise<VaultEntry[]> {
    const start =
      scope === ""
        ? { relativePath: "", absolutePath: this.vault.root }
        : await this.resolveExisting(scope);
    const output: VaultEntry[] = [];
    await this.walk(start.absolutePath, output);
    output.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));
    return output;
  }

  private async walk(directory: string, output: VaultEntry[]): Promise<void> {
    const handle = await fs.opendir(directory);
    for await (const dirent of handle) {
      if (dirent.name.startsWith(".")) continue;
      const absolutePath = path.join(directory, dirent.name);
      if (dirent.isSymbolicLink()) continue;
      if (dirent.isDirectory()) {
        await this.walk(absolutePath, output);
      } else if (dirent.isFile() && dirent.name.toLowerCase().endsWith(".md")) {
        output.push({
          absolutePath,
          relativePath: path.relative(this.vault.root, absolutePath).split(path.sep).join("/")
        });
      }
    }
  }

  private async assertComponentsSafe(target: string, requireTarget: boolean): Promise<void> {
    if (!contains(this.vault.root, target)) {
      throw new ToolFailure("PATH_REJECTED", "Path resolves outside the configured vault.");
    }
    const relative = path.relative(this.vault.root, target);
    let current = this.vault.root;
    const components = relative === "" ? [] : relative.split(path.sep);
    for (let index = 0; index < components.length; index += 1) {
      const component = components[index];
      if (component === undefined) continue;
      current = path.join(current, component);
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) {
          throw new ToolFailure(
            "SYMLINK_NOT_ALLOWED",
            "Symlinks and junctions are not allowed in tool paths."
          );
        }
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          if (requireTarget) {
            throw new ToolFailure("NOTE_NOT_FOUND", "The requested path does not exist.");
          }
          return;
        }
        throw error;
      }
    }
  }
}

export function contains(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}
