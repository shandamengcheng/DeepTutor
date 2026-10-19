const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("mac packaging rebuilds the web app from the current checkout", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "package-mac.js"),
    "utf8",
  );
  const prepareStart = source.indexOf("function preparePackagedWeb");
  const nextFunction = source.indexOf("\nfunction ", prepareStart + 1);
  const prepare = source.slice(prepareStart, nextFunction);

  assert.match(prepare, /const distName = "\.next-desktop"/);
  assert.match(prepare, /run\("npm", \["run", "build"\]/);
  assert.ok(
    prepare.indexOf('run("npm", ["run", "build"]') <
      prepare.indexOf('const standalone = path.join(dist, "standalone")'),
    "the build must happen before an existing standalone output is inspected",
  );
});
