const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const { spawn, spawnSync } = require("node:child_process");

const READY_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 500;

function launcherPaths(runtimeHome) {
  const root = path.join(runtimeHome, "data", "user", "runtime");
  return {
    root,
    state: path.join(root, "launcher.json"),
    log: path.join(root, "launcher.log"),
  };
}

function readLauncherState(runtimeHome) {
  try {
    const value = JSON.parse(fs.readFileSync(launcherPaths(runtimeHome).state, "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function systemSettingsPath(runtimeHome) {
  return path.join(runtimeHome, "data", "user", "settings", "system.json");
}

function canListen(port) {
  const acceptsConnection = (host) => new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.unref();
    socket.setTimeout(250);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
  return Promise.all([acceptsConnection("127.0.0.1"), acceptsConnection("::1")]).then(
    (results) => !results.some(Boolean),
  );
}

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("无法分配本地端口。"));
      });
    });
  });
}

async function ensureAvailablePorts(runtimeHome, portOperations = {}) {
  const portIsAvailable = portOperations.canListen || canListen;
  const nextFreePort = portOperations.allocatePort || allocatePort;
  const settingsPath = systemSettingsPath(runtimeHome);
  let current = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (parsed && typeof parsed === "object") current = parsed;
  } catch {
    // The Python launcher will fill every setting not owned by this preflight.
  }
  let backendPort = Number(current.backend_port) || 8001;
  let frontendPort = Number(current.frontend_port) || 3782;
  let changed = !fs.existsSync(settingsPath);
  if (!(await portIsAvailable(backendPort))) {
    backendPort = await nextFreePort();
    changed = true;
  }
  if (frontendPort === backendPort || !(await portIsAvailable(frontendPort))) {
    do {
      frontendPort = await nextFreePort();
    } while (frontendPort === backendPort);
    changed = true;
  }
  if (changed) {
    const directory = path.dirname(settingsPath);
    const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      temporaryPath,
      `${JSON.stringify({ ...current, version: Number(current.version) || 1, backend_port: backendPort, frontend_port: frontendPort }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    fs.renameSync(temporaryPath, settingsPath);
    fs.chmodSync(settingsPath, 0o600);
  }
  return { backendPort, frontendPort, changed };
}

function isProcessAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function prependPythonPath(environment, projectRoot) {
  if (!projectRoot || !fs.existsSync(path.join(projectRoot, "pyproject.toml"))) {
    return environment;
  }
  const separator = process.platform === "win32" ? ";" : ":";
  const current = environment.PYTHONPATH || "";
  return {
    ...environment,
    PYTHONPATH: current ? `${projectRoot}${separator}${current}` : projectRoot,
  };
}

function pythonCandidates(projectRoot, environment = process.env, bundledPython = null) {
  const candidates = [
    environment.DEEPTUTOR_PYTHON,
    bundledPython,
    projectRoot && path.join(projectRoot, ".venv", "bin", "python"),
    projectRoot && path.join(projectRoot, "venv", "bin", "python"),
    "python3",
    "python",
  ].filter(Boolean);
  return [...new Set(candidates)];
}

function resolvePython(projectRoot, environment = process.env, bundledPython = null) {
  const probeEnvironment = prependPythonPath({ ...environment }, projectRoot);
  for (const candidate of pythonCandidates(projectRoot, environment, bundledPython)) {
    const result = spawnSync(candidate, ["-c", "import deeptutor_cli"], {
      cwd: projectRoot || os.homedir(),
      env: probeEnvironment,
      stdio: "ignore",
    });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error(
    "找不到可运行 DeepTutor 的 Python。请先执行 `pip install -e .`，或设置 DEEPTUTOR_PYTHON。",
  );
}

function hostToolDirectories(homeDirectory = os.homedir()) {
  const directories = [
    path.join(homeDirectory, ".local", "bin"),
    path.join(homeDirectory, "bin"),
    path.join(homeDirectory, "Library", "pnpm"),
    path.join(homeDirectory, ".cargo", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/Applications/ChatGPT.app/Contents/Resources",
  ];
  const nvmVersions = path.join(homeDirectory, ".nvm", "versions", "node");
  try {
    for (const version of fs.readdirSync(nvmVersions).sort().reverse()) {
      directories.push(path.join(nvmVersions, version, "bin"));
    }
  } catch {
    // NVM is optional. Packaged builds carry their own Node runtime.
  }
  return directories.filter((directory) => fs.existsSync(directory));
}

function childEnvironment({ runtimeHome, projectRoot, privacyEnvironment, bundledNode }) {
  let environment = prependPythonPath(
    {
      ...process.env,
      ...privacyEnvironment,
      DEEPTUTOR_HOME: runtimeHome,
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONNOUSERSITE: "1",
    },
    projectRoot,
  );
  const toolPath = [
    bundledNode && fs.existsSync(bundledNode) ? path.dirname(bundledNode) : null,
    ...hostToolDirectories(),
    environment.PATH || "",
  ]
    .filter(Boolean)
    .join(path.delimiter);
  return { ...environment, PATH: toolPath };
}

function runPython(python, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, output }));
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isFrontendReady(target, timeoutMs = 1_000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      resolve(ready);
    };
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      finish(false);
      return;
    }
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(parsed, (response) => {
      response.resume();
      response.once("end", () => finish(true));
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      finish(false);
    });
    request.once("error", () => finish(false));
  });
}

async function waitForReady(
  runtimeHome,
  timeoutMs = READY_TIMEOUT_MS,
  frontendProbe = isFrontendReady,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = readLauncherState(runtimeHome);
    if (state?.status === "ready" && state.frontend_url && isProcessAlive(state.pid)) {
      if (await frontendProbe(state.frontend_url)) return state;
    }
    if (state?.pid && !isProcessAlive(state.pid)) {
      throw new Error(`DeepTutor 启动进程已退出。日志：${launcherPaths(runtimeHome).log}`);
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`等待 DeepTutor 启动超时。日志：${launcherPaths(runtimeHome).log}`);
}

async function startRuntime(options) {
  const existing = readLauncherState(options.runtimeHome);
  const frontendProbe = options.frontendProbe || isFrontendReady;
  if (existing?.status === "ready" && existing.frontend_url && isProcessAlive(existing.pid)) {
    if (await frontendProbe(existing.frontend_url)) {
      return { state: existing, startedByDesktop: false };
    }
    await stopRuntime(options);
  }
  if (existing?.status === "starting" && isProcessAlive(existing.pid)) {
    return {
      state: await waitForReady(options.runtimeHome, READY_TIMEOUT_MS, frontendProbe),
      startedByDesktop: false,
    };
  }

  await ensureAvailablePorts(options.runtimeHome);
  const python = resolvePython(
    options.projectRoot,
    options.environment,
    options.bundledPython,
  );
  const environment = childEnvironment({
    runtimeHome: options.runtimeHome,
    projectRoot: options.projectRoot,
    privacyEnvironment: options.privacyEnvironment,
    bundledNode: options.bundledNode,
  });
  const result = await runPython(
    python,
    ["-m", "deeptutor_cli.main", "start", "--home", options.runtimeHome, "--detach", "--no-browser"],
    { cwd: options.projectRoot || options.runtimeHome, env: environment },
  );
  if (result.code !== 0) {
    throw new Error(result.output.trim() || `DeepTutor 启动命令退出，状态码 ${result.code}`);
  }
  return {
    state: await waitForReady(options.runtimeHome, READY_TIMEOUT_MS, frontendProbe),
    startedByDesktop: true,
    python,
    environment,
  };
}

async function stopRuntime(options) {
  const state = readLauncherState(options.runtimeHome);
  if (!state?.pid || !isProcessAlive(state.pid)) return false;
  const python = options.python || resolvePython(
    options.projectRoot,
    options.environment,
    options.bundledPython,
  );
  const environment = options.childEnvironment || childEnvironment({
    runtimeHome: options.runtimeHome,
    projectRoot: options.projectRoot,
    privacyEnvironment: options.privacyEnvironment || {},
    bundledNode: options.bundledNode,
  });
  const result = await runPython(
    python,
    ["-m", "deeptutor_cli.main", "stop", "--home", options.runtimeHome],
    { cwd: options.projectRoot || options.runtimeHome, env: environment },
  );
  if (result.code !== 0 && isProcessAlive(state.pid)) {
    throw new Error(result.output.trim() || "DeepTutor 未能正常停止。");
  }
  return true;
}

module.exports = {
  childEnvironment,
  ensureAvailablePorts,
  hostToolDirectories,
  isProcessAlive,
  isFrontendReady,
  launcherPaths,
  pythonCandidates,
  readLauncherState,
  resolvePython,
  startRuntime,
  stopRuntime,
  waitForReady,
};
