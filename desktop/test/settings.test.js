const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_SETTINGS,
  environmentForPrivacyMode,
  loadDesktopSettings,
  PRIVACY_MODES,
  saveDesktopSettings,
} = require("../src/settings");

test("loads defaults when no desktop settings exist", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "deeptutor-desktop-"));
  assert.deepEqual(loadDesktopSettings(home), DEFAULT_SETTINGS);
});

test("persists normalized settings with private permissions", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "deeptutor-desktop-"));
  const saved = saveDesktopSettings(home, {
    privacyMode: PRIVACY_MODES.LOCAL_ONLY,
    globalShortcut: "Command+Shift+D",
    hideOnClose: false,
  });
  assert.equal(loadDesktopSettings(home).privacyMode, PRIVACY_MODES.LOCAL_ONLY);
  assert.equal(saved.hideOnClose, false);
  if (process.platform !== "win32") {
    const mode = fs.statSync(path.join(home, "data/user/settings/desktop.json")).mode & 0o777;
    assert.equal(mode, 0o600);
  }
});

test("local-only mode disables the automatic version check", () => {
  assert.deepEqual(environmentForPrivacyMode(PRIVACY_MODES.LOCAL_ONLY), {
    DEEPTUTOR_DESKTOP_PRIVACY_MODE: PRIVACY_MODES.LOCAL_ONLY,
    DEEPTUTOR_VERSION_CHECK_ENABLED: "false",
  });
});
