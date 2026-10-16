# ✂️ CustomEdit4LC

A small desktop video editor (Electron) for quick edits: load a video, audio file or image (from your PC or via a YouTube, TikTok, X, etc. link), cut a clip, add image/sound effects, then export it.

> **Non-commercial use only**, see the [LICENSE](./LICENSE) file. The source code is public and modifiable, but it may not be used for profit.

## Features

- Import a local file (video, audio, image) or download from a URL (yt-dlp)
- Clip trimming (start / end) with preview
- Adjustable speed and volume
- Manual crop (top, bottom, left, right)
- Video effects (black & white, sepia, blur, pixelate, glitch, etc.)
- Audio effects (high/low pitch, echo, robot, demon, etc.)
- Image + background music to generate a video
- Export to MP4 or MP3, with one-click copy to the clipboard

## Requirements

- **Windows** (the project uses `yt-dlp.exe` and the Windows clipboard)
- [Node.js](https://nodejs.org/) (LTS recommended) and npm
- [Git](https://git-scm.com/)

## Installation

```bash
git clone <REPO_URL>
cd <FOLDER_NAME>
npm install
```

During `npm install`, the `ffmpeg` and `yt-dlp` binaries are fetched automatically (an internet connection is required).

## Run in development

```bash
npm run dev
```

The Electron window opens with hot reload enabled.

## Build (create the executable)

```bash
npm run build
```

The build compiles the interface, then packages the app with **electron-builder**. The installer / executable is generated in the output folder defined in `package.json` (`directories.output`, usually `release/` or `dist/`).

> The `dev` and `build` scripts may have different names depending on your `package.json`. Check the `scripts` section and adjust the commands if needed.

## Usage

1. Pick a file from your PC, or paste a link and click **Download**.
2. Set the start and end of the clip with the selection slider.
3. Adjust speed, volume, crop and effects.
4. Click **Export final file** and name the file.
5. The result is saved in `Desktop/CustomEdit4LC` with the `CE4LC_` prefix.

## Project structure

```
electron/
  main.ts        # Main process: download, FFmpeg export, IPC
  preload.mjs    # Secure bridge between Electron and the UI (electronAPI)
src/
  App.tsx        # React UI (player, timeline, effects, export)
  index.css      # Styles
```

> Adapt this tree if your folders are named differently.

## Contributing

Contributions are welcome, as long as they respect the license (non-commercial use).

1. **Fork** the repository, then create a dedicated branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes and test them with `npm run dev`.
3. Commit with clear messages:
   ```bash
   git commit -m "Add effect X"
   ```
4. Push your branch and open a **Pull Request**.

### Writing a good Pull Request

A PR should be **descriptive** so it is easy to review. Please include:

- **Clear title**: what the PR does in one sentence (e.g. "Add manual crop").
- **Context**: which problem or need the PR addresses, and why.
- **Changes**: the files or functions modified, and what changed.
- **How to test**: the steps to reproduce and verify (file type, effect used, expected result).
- **Screenshots or videos** if the UI changes.
- **Things to watch**: known limitations, specific choices, possible side effects.

Keep each PR **focused on a single topic**; it is easier to review and merge.

### Reporting a bug or suggesting an idea

Open an **Issue** describing what you did, what you expected, what happened, and if possible the error message and the type of file used.

## License

Distributed under the **PolyForm Noncommercial 1.0.0** license. Commercial use is prohibited. See the [LICENSE](./LICENSE) file.
