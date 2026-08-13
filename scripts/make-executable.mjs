import { chmod } from "node:fs/promises";

if (process.platform !== "win32") {
  await chmod(new URL("../dist/main.js", import.meta.url), 0o755);
}
