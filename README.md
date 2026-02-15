# Quantum Visualizer

Interactive quantum circuit and state visualization app built with React + Vite.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy To GitHub Pages

This repo includes an automated Pages workflow at `.github/workflows/deploy-pages.yml`.

What it does:
- Runs on pushes to `main` (and manual trigger).
- Builds the app with the correct Vite `base` path.
- Publishes `dist/` to GitHub Pages.

One-time GitHub setup:
1. Push this repo to GitHub.
2. In your repo, go to `Settings` > `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Ensure your default branch is `main` (or update the workflow trigger branch).
5. Push to `main` and wait for the `Deploy to GitHub Pages` workflow to finish.

Notes:
- For project pages (`github.com/<user>/<repo>`), deployment path is `/<repo>/`.
- For user/org pages repos named `<user>.github.io`, deployment path is `/`.
- The workflow auto-detects this and sets `VITE_BASE_PATH` for the build.
