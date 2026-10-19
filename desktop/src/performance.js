const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { readLauncherState, launcherPaths } = require("./runtime");

const GROUPS = ["electron", "frontend_renderer", "backend", "frontend_server", "launcher"];

function cpuSeconds(value) {
  const [days, clock] = value.includes("-") ? value.split("-") : ["0", value];
  return Number(days) * 86400 + clock.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

function parseProcesses(output) {
  return output.trim().split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (!match) return [];
    return [{ pid: Number(match[1]), ppid: Number(match[2]), rssMiB: Number(match[3]) / 1024,
      cpuSeconds: cpuSeconds(match[4]), identity: match[5] }];
  });
}

function processTree(rows, root) {
  const ids = new Set(rows.some((row) => row.pid === Number(root)) ? [Number(root)] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (ids.has(row.ppid) && !ids.has(row.pid)) {
      ids.add(row.pid);
      changed = true;
    }
  }
  return ids;
}

function groupProcesses(rows, { electronPids, rendererPid, state }, previous, elapsedMs) {
  const info = state?.performance || {};
  const frontend = processTree(rows, info.frontend_pid);
  const backend = processTree(rows, info.backend_pid);
  const launcher = processTree(rows, state?.pid);
  const groups = Object.fromEntries(GROUPS.map((name) => [name, { rssMiB: 0, cpuPercent: null, processes: [] }]));
  for (const row of rows) {
    const group = row.pid === rendererPid ? "frontend_renderer"
      : electronPids.has(row.pid) ? "electron"
      : frontend.has(row.pid) ? "frontend_server"
      : backend.has(row.pid) ? "backend" : launcher.has(row.pid) ? "launcher" : null;
    if (!group) continue;
    const old = previous.get(row.pid);
    const cpuPercent = old?.identity === row.identity && elapsedMs > 0 && row.cpuSeconds >= old.cpuSeconds
      ? (row.cpuSeconds - old.cpuSeconds) / elapsedMs * 100000 : null;
    const entry = groups[group];
    entry.rssMiB += row.rssMiB;
    entry.processes.push({ pid: row.pid, rssMiB: row.rssMiB, cpuPercent });
  }
  for (const entry of Object.values(groups)) {
    if (!entry.processes.length) entry.rssMiB = null;
    if (entry.processes.length && entry.processes.every((row) => row.cpuPercent !== null)) {
      entry.cpuPercent = entry.processes.reduce((sum, row) => sum + row.cpuPercent, 0);
    }
  }
  return groups;
}

function readProcesses() {
  return new Promise((resolve, reject) => {
    execFile("/bin/ps", ["-axo", "pid=,ppid=,rss=,time=,lstart="],
      { timeout: 2000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
        if (error) reject(error); else resolve(parseProcesses(stdout));
      });
  });
}

function reportHtml(data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><title>DeepTutor 性能报告</title>
<style>body{font:15px system-ui;max-width:1100px;margin:40px auto;padding:0 24px;color:#182332}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd}pre{white-space:pre-wrap}svg{width:100%;height:140px;background:#f2f5f8}</style>
<h1>DeepTutor 性能报告</h1><p>刷新页面查看最新采样。CPU 100% = 一个逻辑核心；内存为进程 RSS 之和，含共享页，不能视为独占物理内存。缺失值表示尚未采到。</p>
<div id="content"></div><script>
const data=${json}; const names={electron:'Electron 主进程 / GPU / Utility',frontend_renderer:'前端 Renderer',backend:'本地后端及子进程',frontend_server:'前端服务器及子进程',launcher:'启动器 / 尚未分类的服务'};
const fmt=v=>v==null?'—':v.toFixed(1); const last=data.samples.at(-1);
let html='<p>会话：'+data.session+' · 样本：'+data.sampleCount+' · '+(data.stopped?'已停止':'采集中')+'</p><table><tr><th>分组</th><th>当前内存 MiB</th><th>峰值 MiB</th><th>当前 CPU %</th><th>峰值 CPU %</th></tr>';
for(const [key,name] of Object.entries(names)){ const peak=data.peaks[key]||{};const current=last?.groups[key]||{};html+='<tr><td>'+name+'</td><td>'+fmt(current.rssMiB)+'</td><td>'+fmt(peak.rssMiB)+'</td><td>'+fmt(current.cpuPercent)+'</td><td>'+fmt(peak.cpuPercent)+'</td></tr>'; }
html+='</table><h2>内存趋势（最近 600 个样本）</h2>';
for(const [key,name] of Object.entries(names)){const values=data.samples.map(s=>s.groups[key].rssMiB);const max=Math.max(1,...values.filter(v=>v!=null));html+='<p>'+name+'</p><svg viewBox="0 0 1000 140" preserveAspectRatio="none"><polyline fill="none" stroke="#4163d8" stroke-width="2" points="'+values.map((v,i)=>v==null?'':(i/Math.max(1,values.length-1)*1000)+','+(135-v/max*125)).join(' ')+'"/></svg>';}
html+='<h2>启动阶段</h2><pre>'+JSON.stringify(data.events,null,2)+'</pre><h2>页面指标（导航到首屏绘制，不等于 React 可交互）</h2><pre>'+JSON.stringify(data.renderer,null,2)+'</pre><h2>采样状态</h2><pre>'+JSON.stringify(data.errors,null,2)+'</pre>';document.getElementById('content').innerHTML=html;
</script></html>`;
}

function createPerformanceMonitor({ app, runtimeHome, getWindow, startedAt = performance.now() - process.uptime() * 1000 }) {
  const root = path.join(launcherPaths(runtimeHome).root, "performance");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const session = `${Date.now()}-${process.pid}`;
  const paths = { samples: path.join(root, `${session}.jsonl`), report: path.join(root, `${session}.html`), summary: path.join(root, `${session}.json`) };
  const data = { session, startedAt: new Date().toISOString(), sampleCount: 0, samples: [], peaks: {}, events: [], renderer: null, errors: [], stopped: false };
  let previous = new Map(), previousAt = null, busy = false, stopped = false, bytes = 0;
  let timer;
  const write = () => {
    fs.writeFileSync(paths.summary, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.writeFileSync(paths.report, reportHtml(data), { mode: 0o600 });
  };
  const record = (name, detail = {}) => {
    data.events.push({ name, elapsedMs: performance.now() - startedAt, ...detail });
    if (data.events.length > 200) data.events.shift();
    try { write(); } catch { /* Monitoring must not interrupt the app. */ }
  };
  const sample = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const rows = await readProcesses();
      if (stopped) return;
      const now = performance.now();
      const window = getWindow();
      const state = readLauncherState(runtimeHome);
      const groups = groupProcesses(rows, {
        electronPids: new Set(app.getAppMetrics().map((row) => row.pid)),
        rendererPid: window?.isDestroyed() ? null : window?.webContents.getOSProcessId(), state,
      }, previous, previousAt === null ? 0 : now - previousAt);
      previous = new Map(rows.map((row) => [row.pid, row])); previousAt = now;
      const entry = { timestamp: new Date().toISOString(), elapsedMs: now - startedAt, visible: Boolean(window && !window.isDestroyed() && window.isVisible()), renderer: data.renderer, groups };
      const line = JSON.stringify(entry) + "\n";
      bytes += Buffer.byteLength(line);
      if (bytes > 20 * 1024 * 1024) { stop("20 MiB sample limit"); return; }
      fs.appendFileSync(paths.samples, line, { mode: 0o600 });
      data.sampleCount += 1; data.samples.push(entry);
      if (data.samples.length > 600) data.samples.shift();
      for (const [key, value] of Object.entries(groups)) {
        const peak = data.peaks[key] ||= { rssMiB: null, cpuPercent: null };
        for (const metric of ["rssMiB", "cpuPercent"]) if (value[metric] !== null) peak[metric] = Math.max(peak[metric] || 0, value[metric]);
      }
      write();
    } catch (error) {
      data.errors.push({ at: new Date().toISOString(), message: error.message });
      data.errors = data.errors.slice(-10);
      try { write(); } catch { /* Monitoring must not interrupt the app. */ }
    } finally { busy = false; }
  };
  const stop = (reason = "quit") => {
    if (stopped) return;
    stopped = true; clearInterval(timer); data.stopped = true;
    try { record("monitor_stopped", { reason }); } catch { /* Best effort on shutdown. */ }
  };
  record("electron_ready");
  timer = setInterval(sample, 3000); timer.unref(); void sample();
  return { paths, record, stop, renderer: (value) => { data.renderer = value; } };
}

module.exports = { cpuSeconds, parseProcesses, processTree, groupProcesses, reportHtml, createPerformanceMonitor };
