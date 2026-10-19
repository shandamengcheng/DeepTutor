const assert = require("node:assert/strict");
const test = require("node:test");
const { cpuSeconds, parseProcesses, groupProcesses, reportHtml } = require("../src/performance");

test("parses macOS/Linux cumulative CPU time and RSS units", () => {
  assert.equal(cpuSeconds("1-02:03:04.50"), 93784.5);
  const rows = parseProcesses(" 10 1 2048 0:01.50 Mon Oct 12 10:00:00 2026\ninvalid");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rssMiB, 2);
  assert.equal(rows[0].cpuSeconds, 1.5);
});

test("separates renderer and nested backend/frontend children without double counting", () => {
  const rows = [[1, 0], [2, 1], [3, 1], [10, 0], [11, 10], [12, 11], [20, 10], [21, 20]]
    .map(([pid, ppid]) => ({ pid, ppid, rssMiB: 1, cpuSeconds: 2, identity: "start" }));
  const previous = new Map(rows.map((row) => [row.pid, { ...row, cpuSeconds: 1 }]));
  const groups = groupProcesses(rows, { electronPids: new Set([1, 2, 3]), rendererPid: 2,
    state: { pid: 10, performance: { backend_pid: 11, frontend_pid: 20 } } }, previous, 2000);
  assert.equal(groups.electron.rssMiB, 2);
  assert.equal(groups.frontend_renderer.rssMiB, 1);
  assert.equal(groups.backend.rssMiB, 2);
  assert.equal(groups.frontend_server.rssMiB, 2);
  assert.equal(groups.launcher.rssMiB, 1);
  assert.equal(groups.backend.cpuPercent, 100);
});

test("missing roots and reused PIDs remain unknown instead of reporting zero CPU", () => {
  const rows = [{ pid: 1, ppid: 0, rssMiB: 5, cpuSeconds: 3, identity: "new" }];
  const groups = groupProcesses(rows, { electronPids: new Set([1]), rendererPid: null, state: null },
    new Map([[1, { cpuSeconds: 2, identity: "old" }]]), 3000);
  assert.equal(groups.electron.cpuPercent, null);
  assert.equal(groups.backend.rssMiB, null);
});

test("report data cannot break out of its script element", () => {
  assert.ok(!reportHtml({ session: '</script><script>alert(1)</script>' }).includes('session":"</script>'));
});

test("sandbox preload reports numeric page metrics without exposing a bridge", () => {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "../src/performance-preload.js"), "utf8");
  let load, observe, sent;
  const context = {
    require: () => ({ ipcRenderer: { send: (channel, value) => { sent = { channel, value }; } } }),
    location: { hostname: "localhost" },
    PerformanceObserver: class { constructor(callback) { observe = callback; } observe() {} },
    performance: { timeOrigin: 1000, memory: { usedJSHeapSize: 1048576 },
      getEntriesByType: () => [{ domContentLoadedEventEnd: 10, loadEventEnd: 20 }],
      getEntriesByName: () => [{ startTime: 15 }] },
    window: { addEventListener: (_name, callback) => { load = callback; } },
    setTimeout: (fn) => fn(), setInterval() {},
  };
  vm.runInNewContext(source, context);
  observe({ getEntries: () => [{ duration: 120 }] });
  load();
  assert.equal(sent.channel, "desktop:performance");
  assert.equal(sent.value.jsHeapMiB, 1);
  assert.equal(sent.value.firstContentfulPaintMs, 15);
  assert.equal(sent.value.longTaskMs, 120);
  assert.equal(sent.value.longTaskCount, 1);
  assert.deepEqual(Object.keys(context.window), ["addEventListener"]);
});
