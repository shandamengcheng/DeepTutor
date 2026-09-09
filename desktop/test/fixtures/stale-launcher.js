const fs = require("node:fs");
const path = require("node:path");

const runtimeHome = process.argv[2];
if (!runtimeHome) throw new Error("runtime home is required");

const runtimeDirectory = path.join(runtimeHome, "data", "user", "runtime");
const statePath = path.join(runtimeDirectory, "launcher.json");
const stopPath = path.join(runtimeDirectory, "launcher.stop");
const token = "desktop-stale-runtime-fixture";

fs.mkdirSync(runtimeDirectory, { recursive: true });
fs.writeFileSync(
  statePath,
  `${JSON.stringify({
    version: 1,
    token,
    pid: process.pid,
    status: "ready",
    home: runtimeHome,
    frontend_url: "http://127.0.0.1:9",
    backend_port: 9,
    frontend_port: 9,
  }, null, 2)}\n`,
);

const timer = setInterval(() => {
  try {
    if (fs.readFileSync(stopPath, "utf8").trim() !== token) return;
    clearInterval(timer);
    fs.rmSync(stopPath, { force: true });
    fs.rmSync(statePath, { force: true });
    process.exit(0);
  } catch {
    // Wait until the real DeepTutor stop command writes the matching token.
  }
}, 50);
