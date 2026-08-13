export type ToolErrorCode =
  | "VAULT_NOT_FOUND"
  | "PATH_REJECTED"
  | "SYMLINK_NOT_ALLOWED"
  | "NOTE_NOT_FOUND"
  | "ALREADY_EXISTS"
  | "REVISION_CONFLICT"
  | "LOCK_TIMEOUT"
  | "INVALID_FRONTMATTER"
  | "INVALID_ENCODING"
  | "INVALID_CURSOR"
  | "INPUT_TOO_LARGE"
  | "TRANSACTION_FAILED"
  | "PERMISSION_DENIED"
  | "FILESYSTEM_ERROR"
  | "INVALID_ARGUMENT";

export interface PublicToolError {
  code: ToolErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class ToolFailure extends Error {
  readonly code: ToolErrorCode;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ToolErrorCode,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "ToolFailure";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }

  toPublic(): PublicToolError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details === undefined ? {} : { details: this.details })
    };
  }
}

export function asToolFailure(error: unknown, action: string): ToolFailure {
  if (error instanceof ToolFailure) return error;
  if (isNodeError(error)) {
    if (error.code === "ENOENT") {
      return new ToolFailure("NOTE_NOT_FOUND", `The requested note does not exist.`, {
        details: { action }
      });
    }
    if (error.code === "EACCES" || error.code === "EPERM") {
      return new ToolFailure(
        "PERMISSION_DENIED",
        `Permission was denied while trying to ${action}.`,
        {
          details: { action }
        }
      );
    }
    if (error.code === "EEXIST") {
      return new ToolFailure("ALREADY_EXISTS", `The destination already exists.`, {
        details: { action }
      });
    }
  }
  return new ToolFailure("FILESYSTEM_ERROR", `Unable to ${action}.`, {
    retryable: true,
    details: { action },
    cause: error
  });
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
