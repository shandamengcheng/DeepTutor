const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const test = require('node:test');

function harness() {
  const windows = [];
  let ready;
  let completeStartup;
  const startup = new Promise(resolve => { completeStartup = resolve; });
  const app = new EventEmitter();
  Object.assign(app, { setName() {}, requestSingleInstanceLock: () => true,
    quit() {}, getPath: () => '/tmp/deeptutor-window-test',
    whenReady: () => ({ then(callback) { ready = callback; } }) });
  class Window extends EventEmitter {
    constructor() {
      super(); windows.push(this); this.destroyed = false; this.visible = false;
      this.urls = []; this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
    }
    isDestroyed() { return this.destroyed; }
    check() { if (this.destroyed) throw new TypeError('Object has been destroyed'); }
    isVisible() { this.check(); return this.visible; }
    isMinimized() { this.check(); return false; }
    show() { this.check(); this.visible = true; }
    hide() { this.check(); this.visible = false; }
    focus() { this.check(); }
    restore() { this.check(); }
    async loadURL(url) { this.check(); this.urls.push(url); }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const context = vm.createContext({ console, process: { env: {}, resourcesPath: "/tmp/no-bundled-runtime", cwd: () => process.cwd() }, setTimeout,
    require(name) {
      if (name === './performance') return { createPerformanceMonitor: () => ({ record() {}, stop() {}, renderer() {}, paths: {} }) };
      if (name === 'electron') return { app, BrowserWindow: Window, ipcMain: new EventEmitter(),
        dialog: { showMessageBox: async () => ({ response: 1 }) },
        globalShortcut: { unregisterAll() {}, register: () => true },
        Menu: { setApplicationMenu() {}, buildFromTemplate: x => x },
        nativeImage: { createFromDataURL() {} }, shell: {},
        Tray: class extends EventEmitter { setTitle() {} setToolTip() {} setContextMenu() {} } };
      if (name === './runtime') return { launcherPaths: () => ({}),
        startRuntime: () => startup, stopRuntime: async () => {} };
      if (name === './settings') return { loadDesktopSettings: () => ({ hideOnClose: false }),
        PRIVACY_MODES: {}, environmentForPrivacyMode: () => ({}) };
      if (name === './lifecycle') return require('../src/lifecycle');
      return require(name);
    }, __dirname: path.resolve(__dirname, '../src') });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8'), context);
  return { windows, app, context, ready: () => ready(), completeStartup: () => completeStartup({
    state: { frontend_url: 'http://localhost:3782' }, startedByDesktop: false }) };
}

test('closed window is recreated on activation and visible activation stays visible', async () => {
  const h = harness(); const launch = h.ready(); h.completeStartup(); await launch;
  h.windows[0].destroy();
  h.app.emit('activate');
  assert.equal(h.windows.length, 2);
  assert.equal(h.windows[1].visible, true);
  assert.deepEqual(h.windows[1].urls, ['http://localhost:3782']);
  h.app.emit('activate'); assert.equal(h.windows[1].visible, true);
});

test('startup finishing after window destruction loads a live replacement', async () => {
  const h = harness(); const launch = h.ready(); h.windows[0].destroy();
  h.completeStartup(); await launch;
  assert.equal(h.windows.length, 2);
  assert.deepEqual(h.windows[1].urls, ['http://localhost:3782']);
});

test('second instance recreates a destroyed window; shutdown does not recreate it', async () => {
  const h = harness(); const launch = h.ready(); h.completeStartup(); await launch;
  h.windows[0].destroy(); h.app.emit('second-instance');
  assert.equal(h.windows.length, 2);
  vm.runInContext('shutdownStarted = true', h.context);
  h.windows[1].destroy(); h.app.emit('activate'); h.app.emit('second-instance');
  assert.equal(h.windows.length, 2);
});
