const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "darwin") throw new Error("package:mac must run on macOS.");

const APP_VERSION = "0.2.0";
const desktopRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(desktopRoot, "..");
const sourceApp = path.join(desktopRoot, "node_modules", "electron", "dist", "Electron.app");
const architecture = os.arch() === "arm64" ? "arm64" : "x64";
const pythonArchitecture = architecture === "arm64" ? "aarch64" : architecture;
const outputRoot = path.join(desktopRoot, "out", `DeepTutor-darwin-${architecture}`);
const targetApp = path.join(outputRoot, "DeepTutor.app");
const targetDmg = path.join(desktopRoot, "out", `DeepTutor-${APP_VERSION}-${architecture}.dmg`);
const contents = path.join(targetApp, "Contents");
const resources = path.join(contents, "Resources");
const appResources = path.join(resources, "app");
const runtimeResources = path.join(resources, "runtime");
const plist = path.join(contents, "Info.plist");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });
  if (result.error || result.status !== 0) {
    const detail = result.stderr || result.stdout || result.error?.message || "unknown error";
    throw new Error(`${command} failed: ${String(detail).trim()}`);
  }
  return String(result.stdout || "").trim();
}

function verifyApplicationSignature() {
  let detail = "unknown error";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    run("sync", []);
    const result = spawnSync(
      "codesign",
      ["--verify", "--deep", "--strict", "--verbose=1", targetApp],
      { encoding: "utf8", stdio: "pipe" },
    );
    if (!result.error && result.status === 0) return;
    detail = result.stderr || result.stdout || result.error?.message || detail;
    if (attempt < 2) run("sleep", ["2"]);
  }
  throw new Error(`codesign verification failed: ${String(detail).trim()}`);
}

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  run("ditto", [source, destination]);
}

function discoverEmbeddedPython() {
  const explicit = process.env.DEEPTUTOR_STANDALONE_PYTHON_HOME;
  if (explicit && fs.existsSync(path.join(explicit, "bin", "python3"))) return explicit;
  const root = path.join(os.homedir(), ".local", "share", "uv", "python");
  const matches = fs.existsSync(root)
    ? fs.readdirSync(root)
      .filter((name) => name.startsWith("cpython-3.13") && name.endsWith(`-macos-${pythonArchitecture}-none`))
      .sort()
      .reverse()
    : [];
  if (!matches.length) {
    throw new Error(
      "No relocatable Python 3.13 runtime found. Install one with `uv python install 3.13` " +
        "or set DEEPTUTOR_STANDALONE_PYTHON_HOME.",
    );
  }
  return path.join(root, matches[0]);
}

function discoverSitePackages() {
  const sourcePython = path.join(projectRoot, ".venv", "bin", "python");
  if (!fs.existsSync(sourcePython)) {
    throw new Error("Missing project .venv. Create the development environment before packaging.");
  }
  return run(sourcePython, ["-c", "import site; print(site.getsitepackages()[0])"], { capture: true });
}

function installCurrentPythonSources(sitePackages) {
  for (const name of ["deeptutor", "deeptutor_cli", "deeptutor_web"]) {
    fs.rmSync(path.join(sitePackages, name), { recursive: true, force: true });
  }
  for (const entry of fs.readdirSync(sitePackages)) {
    if (/^deeptutor-.*\.dist-info$/.test(entry)) {
      fs.rmSync(path.join(sitePackages, entry), { recursive: true, force: true });
    }
  }
  copy(path.join(projectRoot, "deeptutor"), path.join(sitePackages, "deeptutor"));
  copy(path.join(projectRoot, "deeptutor_cli"), path.join(sitePackages, "deeptutor_cli"));
}

function preparePackagedWeb(sitePackages) {
  const webRoot = path.join(projectRoot, "web");
  let distName = [".next-desktop", ".next-deeptutor", ".next"].find((name) =>
    fs.existsSync(path.join(webRoot, name, "standalone", "server.js")),
  );
  if (!distName) distName = ".next-desktop";
  let dist = path.join(webRoot, distName);
  let standalone = path.join(dist, "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js"))) {
    run("npm", ["run", "build"], {
      cwd: webRoot,
      env: {
        ...process.env,
        DEEPTUTOR_NEXT_DIST_DIR: distName,
        NEXT_PUBLIC_API_BASE: "__NEXT_PUBLIC_API_BASE_PLACEHOLDER__",
        NEXT_PUBLIC_AUTH_ENABLED: "__NEXT_PUBLIC_AUTH_ENABLED_PLACEHOLDER__",
      },
    });
    dist = path.join(webRoot, distName);
    standalone = path.join(dist, "standalone");
  }
  if (!fs.existsSync(path.join(standalone, "server.js"))) {
    throw new Error(`Missing packaged Web server at ${path.join(standalone, "server.js")}`);
  }
  const target = path.join(sitePackages, "deeptutor_web");
  copy(standalone, target);
  const staticDirectory = path.join(dist, "static");
  if (fs.existsSync(staticDirectory)) copy(staticDirectory, path.join(target, distName, "static"));
  const publicDirectory = path.join(webRoot, "public");
  if (fs.existsSync(publicDirectory)) copy(publicDirectory, path.join(target, "public"));
  fs.writeFileSync(path.join(target, "__init__.py"), '"""Packaged DeepTutor Web assets."""\n');
  fs.writeFileSync(
    path.join(target, "BUILD_INFO"),
    `DeepTutor Desktop ${APP_VERSION}; generated from web/${distName}/standalone.\n`,
  );
}

function createApplicationIcon() {
  const source = path.join(projectRoot, "web", "public", "logo.png");
  if (!fs.existsSync(source)) return;
  const sourcePython = path.join(projectRoot, ".venv", "bin", "python");
  const script = [
    "from PIL import Image",
    `image = Image.open(${JSON.stringify(source)}).convert('RGBA')`,
    "side = min(image.size)",
    "left = (image.width - side) // 2",
    "top = (image.height - side) // 2",
    "image = image.crop((left, top, left + side, top + side))",
    "image = image.resize((1024, 1024), Image.Resampling.LANCZOS)",
    `image.save(${JSON.stringify(path.join(resources, "deeptutor.icns"))}, format='ICNS')`,
  ].join("; ");
  run(sourcePython, ["-c", script]);
}

function updateInfoPlist() {
  const plistBuddy = "/usr/libexec/PlistBuddy";
  for (const [key, value] of [
    ["CFBundleDisplayName", "DeepTutor"], ["CFBundleName", "DeepTutor"],
    ["CFBundleExecutable", "DeepTutor"], ["CFBundleIdentifier", "ai.deeptutor.desktop"],
    ["CFBundleShortVersionString", APP_VERSION], ["CFBundleVersion", "2"],
    ["CFBundleIconFile", "deeptutor.icns"],
  ]) {
    run(plistBuddy, ["-c", `Set :${key} ${value}`, plist]);
  }
  run(plistBuddy, ["-c", "Set :NSHighResolutionCapable true", plist]);
}

function createDmg() {
  const applicationsLink = path.join(outputRoot, "Applications");
  fs.rmSync(applicationsLink, { force: true });
  fs.rmSync(path.join(outputRoot, "dmg"), { recursive: true, force: true });
  fs.symlinkSync("/Applications", applicationsLink);
  fs.rmSync(targetDmg, { force: true });
  try {
    run("hdiutil", [
      "create", "-volname", "DeepTutor", "-srcfolder", outputRoot,
      "-ov", "-format", "UDZO", targetDmg,
    ]);
  } finally {
    fs.rmSync(applicationsLink, { force: true });
  }
}

if (!fs.existsSync(sourceApp)) {
  throw new Error("Electron is not installed. Run `npm install` in desktop/ first.");
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
copy(sourceApp, targetApp);
fs.rmSync(path.join(resources, "default_app.asar"), { force: true });
copy(path.join(desktopRoot, "src"), path.join(appResources, "src"));
fs.writeFileSync(
  path.join(appResources, "package.json"),
  `${JSON.stringify({ name: "deeptutor-desktop", version: APP_VERSION, private: true, main: "src/main.js" }, null, 2)}\n`,
);

copy(discoverEmbeddedPython(), path.join(runtimeResources, "python"));
const bundledNode = path.join(runtimeResources, "node", "bin", "node");
copy(process.execPath, bundledNode);
const bundledNodeVersion = run(bundledNode, ["--version"], { capture: true });
if (!/^v(?:2[0-9]|[3-9][0-9])\./.test(bundledNodeVersion)) {
  throw new Error(`Bundled Node.js 20+ is required, found ${bundledNodeVersion}.`);
}
const pythonVersion = run(
  path.join(runtimeResources, "python", "bin", "python3"),
  ["-c", "import sys; print(f'python{sys.version_info.major}.{sys.version_info.minor}')"],
  { capture: true },
);
const targetSitePackages = path.join(runtimeResources, "python", "lib", pythonVersion, "site-packages");
copy(discoverSitePackages(), targetSitePackages);
installCurrentPythonSources(targetSitePackages);
preparePackagedWeb(targetSitePackages);

fs.renameSync(path.join(contents, "MacOS", "Electron"), path.join(contents, "MacOS", "DeepTutor"));
createApplicationIcon();
updateInfoPlist();
run("codesign", ["--force", "--sign", "-", bundledNode]);
run("codesign", ["--force", "--deep", "--sign", "-", targetApp]);
verifyApplicationSignature();
createDmg();

console.log(JSON.stringify({ app: targetApp, dmg: targetDmg }, null, 2));
