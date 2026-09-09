const fs = require("node:fs");
const path = require("node:path");

const PRIVACY_MODES = Object.freeze({
  LOCAL_ONLY: "local_only",
  LOCAL_STORAGE: "local_storage",
  CONNECTED: "connected",
});

const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  privacyMode: PRIVACY_MODES.LOCAL_STORAGE,
  globalShortcut: "CommandOrControl+Shift+Space",
  hideOnClose: true,
});

function desktopSettingsPath(runtimeHome) {
  return path.join(runtimeHome, "data", "user", "settings", "desktop.json");
}

function normalizeSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const allowedModes = new Set(Object.values(PRIVACY_MODES));
  return {
    version: 1,
    privacyMode: allowedModes.has(input.privacyMode)
      ? input.privacyMode
      : DEFAULT_SETTINGS.privacyMode,
    globalShortcut:
      typeof input.globalShortcut === "string" && input.globalShortcut.trim()
        ? input.globalShortcut.trim()
        : DEFAULT_SETTINGS.globalShortcut,
    hideOnClose:
      typeof input.hideOnClose === "boolean"
        ? input.hideOnClose
        : DEFAULT_SETTINGS.hideOnClose,
  };
}

function loadDesktopSettings(runtimeHome) {
  const settingsPath = desktopSettingsPath(runtimeHome);
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      console.warn(`Unable to read ${settingsPath}: ${error.message}`);
    }
    return { ...DEFAULT_SETTINGS };
  }
}

function saveDesktopSettings(runtimeHome, value) {
  const settings = normalizeSettings(value);
  const settingsPath = desktopSettingsPath(runtimeHome);
  const directory = path.dirname(settingsPath);
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, settingsPath);
  fs.chmodSync(settingsPath, 0o600);
  return settings;
}

function environmentForPrivacyMode(mode) {
  const normalized = normalizeSettings({ privacyMode: mode }).privacyMode;
  const environment = { DEEPTUTOR_DESKTOP_PRIVACY_MODE: normalized };
  if (normalized === PRIVACY_MODES.LOCAL_ONLY) {
    environment.DEEPTUTOR_VERSION_CHECK_ENABLED = "false";
  }
  return environment;
}

module.exports = {
  DEFAULT_SETTINGS,
  PRIVACY_MODES,
  desktopSettingsPath,
  environmentForPrivacyMode,
  loadDesktopSettings,
  normalizeSettings,
  saveDesktopSettings,
};
