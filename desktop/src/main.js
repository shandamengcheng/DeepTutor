const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  Menu,
  nativeImage,
  shell,
  Tray,
} = require("electron");

const {
  environmentForPrivacyMode,
  loadDesktopSettings,
  PRIVACY_MODES,
  saveDesktopSettings,
} = require("./settings");
const { ownsRuntime, quitAfterReadyDelay, shouldHideOnClose } = require("./lifecycle");
const { launcherPaths, startRuntime, stopRuntime } = require("./runtime");

app.setName("DeepTutor");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

let mainWindow = null;
let tray = null;
let runtime = null;
let runtimeHome = null;
let projectRoot = null;
let bundledPython = null;
let bundledNode = null;
let settings = null;
let shutdownStarted = false;
let shutdownComplete = false;

function resolveProjectRoot() {
  const explicit = process.env.DEEPTUTOR_PROJECT_ROOT;
  if (explicit) return path.resolve(explicit);
  const sourceRoot = path.resolve(__dirname, "..", "..");
  const candidates = [sourceRoot, path.join(os.homedir(), "DeepTutor"), process.cwd()];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "pyproject.toml"))) return candidate;
  }
  return null;
}

function resolveBundledPython() {
  const candidate = path.join(process.resourcesPath, "runtime", "python", "bin", "python3");
  return fs.existsSync(candidate) ? candidate : null;
}

function resolveBundledNode() {
  const candidate = path.join(process.resourcesPath, "runtime", "node", "bin", "node");
  return fs.existsSync(candidate) ? candidate : null;
}

function loadingDocument(message) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>DeepTutor</title>
<style>body{margin:0;display:grid;place-items:center;height:100vh;background:#0f1115;color:#eef2f7;font:15px -apple-system,BlinkMacSystemFont,sans-serif}.card{text-align:center}.dot{width:10px;height:10px;border-radius:50%;background:#7c9cff;margin:0 auto 18px;animation:p 1.2s infinite}@keyframes p{50%{opacity:.25;transform:scale(.75)}}</style>
<body><div class="card"><div class="dot"></div><div>${message}</div></div></body></html>`)}`;
}

function isAllowedAppUrl(target) {
  try {
    const url = new URL(target);
    return (
      url.protocol === "data:" ||
      ((url.protocol === "http:" || url.protocol === "https:") &&
        ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    title: "DeepTutor",
    backgroundColor: "#0f1115",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAppUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (shouldHideOnClose({ shutdownStarted, hideOnClose: settings.hideOnClose })) {
      event.preventDefault();
      window.hide();
    }
  });
  void window.loadURL(loadingDocument("正在启动你的本地 DeepTutor…"));
  return window;
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function privacyLabel(mode) {
  return {
    [PRIVACY_MODES.LOCAL_ONLY]: "完全本地（需选择本地模型）",
    [PRIVACY_MODES.LOCAL_STORAGE]: "本地保存 + 云模型",
    [PRIVACY_MODES.CONNECTED]: "联网增强",
  }[mode];
}

async function changePrivacyMode(mode) {
  if (settings.privacyMode === mode) return;
  settings = saveDesktopSettings(runtimeHome, { ...settings, privacyMode: mode });
  rebuildMenus();
  const result = await dialog.showMessageBox(mainWindow, {
    type: "info",
    buttons: ["稍后重启", "立即重启"],
    defaultId: 1,
    cancelId: 0,
    title: "隐私模式已保存",
    message: `已切换到“${privacyLabel(mode)}”`,
    detail:
      mode === PRIVACY_MODES.LOCAL_ONLY
        ? "请同时在 DeepTutor 设置中选择 Ollama、LM Studio 或 llama.cpp。本模式会关闭版本检查，但第一版不会拦截你主动启用的联网工具。"
        : "重新启动 DeepTutor 后，桌面运行环境会应用此模式。",
  });
  if (result.response === 1) await restartOwnedRuntime();
}

function menuTemplate() {
  return [
    {
      label: "DeepTutor",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "显示 DeepTutor", accelerator: settings.globalShortcut, click: toggleWindow },
        {
          label: "打开本地数据目录",
          click: () => void shell.openPath(runtimeHome),
        },
        {
          label: "查看运行日志",
          click: () => void shell.openPath(launcherPaths(runtimeHome).log),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "隐私",
      submenu: Object.values(PRIVACY_MODES).map((mode) => ({
        label: privacyLabel(mode),
        type: "radio",
        checked: settings.privacyMode === mode,
        click: () => void changePrivacyMode(mode),
      })),
    },
    { label: "编辑", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "显示", submenu: [{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { label: "窗口", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }] },
  ];
}

function rebuildMenus() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate()));
  if (tray) {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "显示 DeepTutor", click: toggleWindow },
        { label: `隐私：${privacyLabel(settings.privacyMode)}`, enabled: false },
        { type: "separator" },
        { label: "退出", click: () => app.quit() },
      ]),
    );
  }
}

function createTray() {
  const image = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwPsNwAAAABJRU5ErkJggg==",
  );
  tray = new Tray(image);
  tray.setTitle("DT");
  tray.setToolTip("DeepTutor");
  tray.on("click", toggleWindow);
  rebuildMenus();
}

function registerShortcut() {
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(settings.globalShortcut, toggleWindow);
  if (!ok) console.warn(`无法注册全局快捷键 ${settings.globalShortcut}`);
}

async function launchRuntime() {
  runtime = await startRuntime({
    runtimeHome,
    projectRoot,
    environment: process.env,
    privacyEnvironment: environmentForPrivacyMode(settings.privacyMode),
    bundledPython,
    bundledNode,
  });
  await mainWindow.loadURL(runtime.state.frontend_url);
}

async function restartOwnedRuntime() {
  if (!runtime?.startedByDesktop) {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      message: "当前 DeepTutor 服务并非由桌面应用启动，请手动重启后应用设置。",
    });
    return;
  }
  await mainWindow.loadURL(loadingDocument("正在应用设置并重启 DeepTutor…"));
  await stopRuntime({
    runtimeHome,
    projectRoot,
    python: runtime.python,
    childEnvironment: runtime.environment,
    bundledPython,
    bundledNode,
  });
  runtime = null;
  await launchRuntime();
}

app.whenReady().then(async () => {
  runtimeHome = process.env.DEEPTUTOR_HOME || app.getPath("userData");
  bundledPython = resolveBundledPython();
  bundledNode = resolveBundledNode();
  projectRoot = bundledPython ? null : resolveProjectRoot();
  settings = loadDesktopSettings(runtimeHome);
  mainWindow = createWindow();
  createTray();
  registerShortcut();
  try {
    await launchRuntime();
    const automaticQuitDelay = quitAfterReadyDelay(
      process.env.DEEPTUTOR_DESKTOP_QUIT_AFTER_READY_MS,
    );
    if (automaticQuitDelay !== null) setTimeout(() => app.quit(), automaticQuitDelay);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await mainWindow.loadURL(loadingDocument("DeepTutor 启动失败，请检查提示和运行日志。"));
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "DeepTutor 启动失败",
      message: "桌面应用无法启动本地 DeepTutor 服务。",
      detail,
      buttons: ["打开日志目录", "关闭"],
    }).then(({ response }) => {
      if (response === 0) void shell.openPath(launcherPaths(runtimeHome).root);
    });
  }
});

app.on("activate", () => {
  if (mainWindow) toggleWindow();
});

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  // The menu-bar assistant remains available until the user explicitly quits.
});

app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  if (!ownsRuntime(runtime)) {
    shutdownStarted = true;
    shutdownComplete = true;
    globalShortcut.unregisterAll();
    return;
  }
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  void stopRuntime({
    runtimeHome,
    projectRoot,
    python: runtime.python,
    childEnvironment: runtime.environment,
    bundledPython,
    bundledNode,
  }).catch((error) => {
    console.error(error);
  }).finally(() => {
    shutdownComplete = true;
    globalShortcut.unregisterAll();
    app.quit();
  });
});
