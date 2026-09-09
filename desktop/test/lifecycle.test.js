const assert = require("node:assert/strict");
const test = require("node:test");

const { ownsRuntime, quitAfterReadyDelay, shouldHideOnClose } = require("../src/lifecycle");

test("ordinary window close hides a menu-bar app", () => {
  assert.equal(shouldHideOnClose({ shutdownStarted: false, hideOnClose: true }), true);
});

test("application quit is never intercepted by close-to-menu-bar", () => {
  assert.equal(shouldHideOnClose({ shutdownStarted: true, hideOnClose: true }), false);
});

test("only a runtime started by the desktop app is stopped on quit", () => {
  assert.equal(ownsRuntime({ startedByDesktop: true }), true);
  assert.equal(ownsRuntime({ startedByDesktop: false }), false);
  assert.equal(ownsRuntime(null), false);
});

test("automatic quit is disabled unless a valid test delay is supplied", () => {
  assert.equal(quitAfterReadyDelay(undefined), null);
  assert.equal(quitAfterReadyDelay("invalid"), null);
  assert.equal(quitAfterReadyDelay("1000"), 1000);
});
