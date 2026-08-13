export const MIGRATION_GUIDE_URL =
  "https://github.com/StevenStavrakis/obsidian-mcp/blob/v2-next/MIGRATING.md";

export interface Diagnostic {
  code: string;
  problem: string;
  detected?: string | readonly string[];
  fix: string | readonly string[];
  verify?: string | readonly string[];
  helpAnchor?: string;
}

export class UserFacingError extends Error {
  readonly exitCode: 1 | 2;
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic, exitCode: 1 | 2 = 1, options?: ErrorOptions) {
    super(diagnostic.problem, options);
    this.name = "UserFacingError";
    this.diagnostic = diagnostic;
    this.exitCode = exitCode;
  }
}

export function formatDiagnostic(severity: "error" | "warning", diagnostic: Diagnostic): string {
  const lines = [
    `obsidian-mcp: ${severity} [${diagnostic.code}]`,
    "",
    `Problem: ${diagnostic.problem}`
  ];
  appendSection(lines, "Detected", diagnostic.detected);
  appendSection(lines, "Fix", diagnostic.fix);
  appendSection(lines, "Verify", diagnostic.verify);
  const anchor = diagnostic.helpAnchor === undefined ? "" : `#${diagnostic.helpAnchor}`;
  lines.push("", `More help: ${MIGRATION_GUIDE_URL}${anchor}`);
  return `${lines.join("\n")}\n`;
}

export function writeDiagnostic(severity: "error" | "warning", diagnostic: Diagnostic): void {
  process.stderr.write(formatDiagnostic(severity, diagnostic));
}

export function argsForDisplay(args: readonly string[]): string {
  return JSON.stringify(args);
}

function appendSection(
  lines: string[],
  label: string,
  value: string | readonly string[] | undefined
): void {
  if (value === undefined) return;
  lines.push("");
  if (typeof value === "string") {
    lines.push(`${label}: ${value}`);
    return;
  }
  lines.push(`${label}:`, ...value.map((line) => `  ${line}`));
}
