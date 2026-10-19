const { ipcRenderer } = require("electron");

// No bridge or privileged API is exposed to page scripts.
if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
  let longTaskCount = 0, longTaskMs = 0;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) { longTaskCount += 1; longTaskMs += entry.duration; }
    }).observe({ type: "longtask", buffered: true });
  } catch { /* Not available in every Chromium version. */ }
  const send = () => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByName("first-contentful-paint")[0];
    ipcRenderer.send("desktop:performance", {
      navigationTimeOrigin: performance.timeOrigin,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd || null,
      loadMs: navigation?.loadEventEnd || null,
      firstContentfulPaintMs: paint?.startTime ?? null,
      jsHeapMiB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
      longTaskCount, longTaskMs,
    });
  };
  window.addEventListener("load", () => { setTimeout(send, 0); setInterval(send, 3000); }, { once: true });
}
