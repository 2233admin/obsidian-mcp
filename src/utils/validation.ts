import { MAX_CONTENT_BYTES } from "../constants.js";
import { ToolFailure } from "./errors.js";

export function assertByteLimit(value: string): void {
  if (Buffer.byteLength(value) > MAX_CONTENT_BYTES) {
    throw new ToolFailure("INPUT_TOO_LARGE", "Content exceeds the 5 MiB limit.");
  }
}

export function assertIfMatch(expected: string | undefined, actual: string): void {
  if (expected !== undefined && expected !== actual) {
    throw new ToolFailure(
      "REVISION_CONFLICT",
      "The note changed after it was read. Read it again and retry.",
      { retryable: true }
    );
  }
}

export function assertExpectedMap(
  map: Record<string, string> | undefined,
  notePath: string,
  etag: string
): void {
  const expected = map?.[notePath];
  if (expected !== undefined) assertIfMatch(expected, etag);
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
