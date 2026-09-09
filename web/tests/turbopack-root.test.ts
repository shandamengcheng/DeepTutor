import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const webRoot = process.cwd();

test("Turbopack is rooted at the web package", () => {
  const config = readFileSync(path.join(webRoot, "next.config.js"), "utf8");

  assert.match(
    config,
    /turbopack:\s*\{[\s\S]*?root:\s*__dirname/,
    "Turbopack must not infer a parent workspace from unrelated lockfiles",
  );
});
