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
