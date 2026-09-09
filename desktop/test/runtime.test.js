const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  childEnvironment,
  ensureAvailablePorts,
  hostToolDirectories,
  isFrontendReady,
  launcherPaths,
  pythonCandidates,
  readLauncherState,
} = require("../src/runtime");

const http = require("node:http");

test("uses the DeepTutor detached launcher state contract", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "deeptutor-runtime-"));
  const paths = launcherPaths(home);
  fs.mkdirSync(paths.root, { recursive: true });
  fs.writeFileSync(paths.state, JSON.stringify({ status: "ready", frontend_url: "http://localhost:3782" }));
  assert.equal(readLauncherState(home).frontend_url, "http://localhost:3782");
});

test("prefers an explicitly configured Python", () => {
  assert.equal(
    pythonCandidates("/project", { DEEPTUTOR_PYTHON: "/custom/python" }, "/bundled/python")[0],
    "/custom/python",
  );
});

test("uses the bundled Python before checkout environments", () => {
  assert.equal(pythonCandidates("/project", {}, "/bundled/python")[0], "/bundled/python");
});

test("uses a bundled Node binary without exposing Electron as the frontend runtime", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "deeptutor-runtime-"));
  const bundledNode = path.join(home, "runtime", "node", "bin", "node");
  fs.mkdirSync(path.dirname(bundledNode), { recursive: true });
  fs.writeFileSync(bundledNode, "");

  const environment = childEnvironment({
    runtimeHome: home,
    projectRoot: null,
    privacyEnvironment: {},
    bundledNode,
  });

  assert.equal(environment.PATH.split(":")[0], path.dirname(bundledNode));
  assert.equal(environment.DEEPTUTOR_ELECTRON_EXECUTABLE, undefined);
});

test("discovers existing host tool directories", () => {
  assert.ok(hostToolDirectories().every((directory) => fs.existsSync(directory)));
});

test("discovers user-local CLI directories without a login shell", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "deeptutor-host-tools-"));
  const localBin = path.join(home, ".local", "bin");
  const pnpmBin = path.join(home, "Library", "pnpm");
  fs.mkdirSync(localBin, { recursive: true });
  fs.mkdirSync(pnpmBin, { recursive: true });

  const directories = hostToolDirectories(home);

  assert.ok(directories.includes(localBin));
  assert.ok(directories.includes(pnpmBin));
});

test("moves a desktop runtime away from an occupied port", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "deeptutor-runtime-"));
  const occupiedPort = 8001;
  const settingsDirectory = path.join(home, "data", "user", "settings");
  fs.mkdirSync(settingsDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(settingsDirectory, "system.json"),
    JSON.stringify({ version: 1, backend_port: occupiedPort, frontend_port: occupiedPort }),
  );
  const freePorts = [43821, 43822];
  const result = await ensureAvailablePorts(home, {
    canListen: async () => false,
    allocatePort: async () => freePorts.shift(),
  });
  assert.equal(result.backendPort, 43821);
  assert.equal(result.frontendPort, 43822);
  assert.notEqual(result.backendPort, result.frontendPort);
});

test("requires an actual HTTP response before reusing a ready runtime", async (context) => {
  const server = http.createServer((_request, response) => {
    response.end("OK");
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
  } catch (error) {
    if (error?.code === "EPERM") {
      context.skip("sandbox does not permit loopback listeners");
      return;
    }
    throw error;
  }
  const address = server.address();
  assert.equal(await isFrontendReady(`http://127.0.0.1:${address.port}`), true);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isFrontendReady(`http://127.0.0.1:${address.port}`, 50), false);
});
