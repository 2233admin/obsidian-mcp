export type LogLevel = "error" | "warn" | "info" | "debug";

const priorities: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export class Logger {
  constructor(private readonly level: LogLevel = "info") {}

  log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
    if (priorities[level] > priorities[this.level]) return;
    process.stderr.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields })}\n`
    );
  }
}
