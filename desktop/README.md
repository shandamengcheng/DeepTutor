# DeepTutor Desktop 0.2

DeepTutor Desktop is a local-first macOS application for the existing
DeepTutor personal assistant. The full build embeds Electron, a relocatable
Python 3.13 runtime, DeepTutor's Python dependencies, and the production Next.js
application. The installed app does not need a source checkout, a separate
Python installation, Node.js, or npm.

## User experience

- normal macOS application window and Dock icon
- menu-bar presence and `Command+Shift+Space` show/hide shortcut
- close-to-menu-bar behavior; Quit stops services started by the app
- automatic local-port conflict avoidance
- local data rooted at `~/Library/Application Support/DeepTutor`
- existing chats, memory, notebooks, workspaces, knowledge bases, and settings
- three saved privacy profiles
- links in the Web UI open in the default browser
- renderer isolation, sandboxing, navigation restrictions, and no Node.js
  access from Web content

Secrets remain in DeepTutor's permission-restricted local settings files. The
desktop application deliberately does not use macOS Keychain.

## Install the generated build

Open `out/DeepTutor-0.2.0-arm64.dmg`, then drag `DeepTutor.app` to the
Applications shortcut. The current artifact targets Apple silicon Macs.

The local development artifact has an ad-hoc signature. macOS may require
right-clicking the app and choosing **Open** the first time. A public release
still needs an Apple Developer ID signature and notarization.

## Run the desktop shell from this checkout

```bash
cd desktop
npm install
npm test
npm start
```

Source mode uses the checkout's `.venv` first. `DEEPTUTOR_PYTHON` can select a
different interpreter.

## Build the self-contained app and DMG

The packaging machine needs:

- the project's populated `.venv`
- a relocatable uv Python 3.13 installation (`uv python install 3.13`)
- an existing Next.js standalone production build; otherwise the script builds
  `web/.next-desktop`

Then run:

```bash
cd desktop
npm run package:mac
```

The script creates:

- `out/DeepTutor-darwin-arm64/DeepTutor.app`
- `out/DeepTutor-0.2.0-arm64.dmg`

Set `DEEPTUTOR_STANDALONE_PYTHON_HOME` to select a different relocatable Python
runtime when packaging.

## Privacy profile boundary

- **Local only** disables automatic version checks. Select Ollama, LM Studio,
  llama.cpp, or another local endpoint as the active model. Explicitly enabled
  networking tools remain under the user's control.
- **Local storage + cloud model** keeps persistent application data locally
  while allowing the selected model provider to receive the current request.
- **Connected** additionally permits Web search and remote integrations.

Local persistence is not the same as offline inference. The UI and this guide
state that distinction instead of claiming that cloud-backed prompts never
leave the Mac.

## Performance monitoring

The desktop shell records local performance samples every 3 seconds by default.
Use **DeepTutor → 查看性能报告** to open the current HTML report, or
**打开性能采样目录** to inspect the JSON summary and raw JSONL samples. Refresh
an open report to see new samples. Files live in
`<DEEPTUTOR_HOME>/data/user/runtime/performance/` (normally under
`~/Library/Application Support/DeepTutor`). No metrics are uploaded.
Set `DEEPTUTOR_DESKTOP_PERFORMANCE=0` to disable monitoring.

The report separates:

- Electron main/GPU/utility processes (excluding the page Renderer)
- frontend Renderer, plus JS heap, first contentful paint and long tasks
- backend process tree, including workers and tools launched by the backend
- frontend server process tree (Node/Next.js)
- launcher and service children not yet classified

CPU is calculated from cumulative process CPU-time differences over each
sampling interval: 100% means one logical core; multi-process groups may exceed
100%. The first interval and newly discovered processes have unknown CPU.
Memory is RSS in MiB; summed RSS can double-count shared pages, so it is not
exclusive physical memory. The collector uses macOS/Linux `ps`; errors and
unavailable metrics are shown rather than converted to zero. External model
servers such as an independently started Ollama are outside these process trees.

Startup events include Electron ready (relative to process start), runtime
request/ready, frontend navigation/load, and backend/frontend HTTP readiness
measured by the Python launcher. Reused runtimes are marked: their service
startup durations belong to the original launch. FCP and DOM/load timings are
relative to page navigation, **not** confirmation of React hydration or application
interactivity. Older running launchers without performance PID metadata remain
in the launcher group; restart the services to enable precise grouping.

Each launch creates a separate report. Raw sampling stops at 20 MiB per session;
summary trends retain the latest 600 samples and peaks retain the whole session.
Files have owner-only permissions. Reports from previous launches remain available
until manually deleted from the sampling directory.

For a repeatable baseline, measure a production packaged build with DevTools
closed, on the same machine: cold startup, 10 minutes idle, a long streaming chat
with scrolling, PDF import/retrieval/visualization, and a hidden tray window.
Compare startup stages and group memory/CPU peaks. High Renderer CPU suggests
profiling page work; high backend CPU suggests profiling parsing/retrieval;
large idle Electron overhead provides evidence for a Tauri prototype. A single
startup sample cannot establish the bottleneck for all workloads.
