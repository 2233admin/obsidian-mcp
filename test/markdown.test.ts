import assert from "node:assert/strict";
import test from "node:test";

import {
  extractTags,
  mutateTags,
  renameTag,
  validateTag,
  wildcardMatch
} from "../src/utils/tags.js";

test("tag extraction reads frontmatter and visible content only", () => {
  const note = `---\r\ntitle: Test\r\ntags:\r\n  - Project/Active\r\n---\r\n#visible-tag\r\n\`#inline-code\`\r\n\`\`\`md\r\n#code-tag\r\n\`\`\`\r\n<!-- #comment-tag -->\r\n`;
  assert.deepEqual(
    extractTags(note).map(({ tag, location }) => ({ tag, location })),
    [
      { tag: "Project/Active", location: "frontmatter" },
      { tag: "visible-tag", location: "content" }
    ]
  );
});

test("tag mutation preserves CRLF, BOM, body spacing, and avoids duplicates", () => {
  const original = `\uFEFF---\r\ntitle: Test # comment\r\ntags:\r\n  - existing\r\n---\r\n\r\nBody  \r\n`;
  const result = mutateTags(original, {
    operation: "add",
    tags: ["Existing", "new_tag"],
    location: "frontmatter",
    normalization: "preserve"
  });
  assert.ok(result.text.startsWith("\uFEFF---\r\n"));
  assert.ok(result.text.endsWith("\r\n\r\nBody  \r\n"));
  assert.equal(
    extractTags(result.text).filter((item) => item.tag.toLowerCase() === "existing").length,
    1
  );
  assert.ok(result.text.includes("# comment"));
});

test("rename tag handles nested children only when requested", () => {
  const note = "#project #project/active #other\n";
  const exact = renameTag(note, "project", "work", {
    location: "content",
    includeChildren: false,
    normalization: "preserve"
  });
  assert.equal(exact.text, "#work #project/active #other\n");
  const nested = renameTag(note, "project", "work", {
    location: "content",
    includeChildren: true,
    normalization: "preserve"
  });
  assert.equal(nested.text, "#work #work/active #other\n");
});

test("tag grammar accepts current Obsidian characters and rejects numeric-only tags", () => {
  assert.equal(validateTag("📚/to-read"), "📚/to-read");
  assert.equal(validateTag("snake_case"), "snake_case");
  assert.throws(() => validateTag("1984"));
  assert.throws(() => validateTag("has space"));
  assert.equal(wildcardMatch("project/*", "Project/Active"), true);
  assert.equal(wildcardMatch("project/*", "other/active"), false);
});
