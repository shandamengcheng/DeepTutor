function shouldHideOnClose({ shutdownStarted, hideOnClose }) {
  return !shutdownStarted && Boolean(hideOnClose);
}

function ownsRuntime(runtime) {
  return Boolean(runtime?.startedByDesktop);
}

function quitAfterReadyDelay(value) {
  if (value === undefined || value === null || value === "") return null;
  const milliseconds = Number(value);
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : null;
}

module.exports = { ownsRuntime, quitAfterReadyDelay, shouldHideOnClose };
