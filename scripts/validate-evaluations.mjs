import { access, readFile } from "node:fs/promises";

const source = await readFile(new URL("../evaluations/read-only.xml", import.meta.url), "utf8");
const pairs = source.match(/<qa_pair>[\s\S]*?<\/qa_pair>/g) ?? [];
if (pairs.length !== 10) throw new Error(`Expected 10 evaluation pairs, found ${pairs.length}.`);
for (const pair of pairs) {
  if (!/<question>[^<]+<\/question>/u.test(pair) || !/<answer>[^<]+<\/answer>/u.test(pair)) {
    throw new Error("Every evaluation pair requires one plain question and answer.");
  }
}
await access(new URL("../evaluations/fixture-vault/.obsidian/app.json", import.meta.url));
