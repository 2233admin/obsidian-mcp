# Creating tools

Each tool lives in `src/tools/<tool>/index.ts` and exports a definition factory. Add it to the explicit registry in `src/tools/index.ts`. Do not add low-level MCP request handlers or access filesystem paths directly.

A tool definition must provide:

- a service-prefixed snake_case name, title, and precise description;
- a strict Zod input schema and the shared structured output contract;
- all four MCP annotations;
- an executor that returns vault-relative structured data;
- actionable `ToolFailure` errors rather than protocol errors.

Use `Runtime.forVault()` to resolve the requested vault and `VaultFs` to normalize and validate every path. Use `TransactionManager.run()` for every mutation; compute all primary and secondary changes before committing. Never interpolate a path into a shell command, follow symlinks, log note content, expose absolute paths, or write directly to stdout.

Add unit tests for schemas and service behavior, security regressions for paths, and an end-to-end MCP call in `test/integration/server.test.ts`. The registry must continue to expose exactly the documented 12 tools unless a deliberate API version changes that contract.
