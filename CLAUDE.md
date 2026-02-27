# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Micro Frontend (MFP)** project using **Webpack Module Federation**. The repo is organized as a monorepo under `packages/` with independent sub-applications.

## Packages

| Package | Framework | Port (dev) | Status |
|---------|-----------|-----------|--------|
| `container` | React 17 | 8080 | Host shell |
| `marketing` | React 17 | 8081 | Remote MFE |
| `auth` | React 17 | - | Scaffold only (no src yet) |
| `dashboard` | Vue 3 + PrimeVue | - | Scaffold only (no src yet) |

## Commands

Each package is independent — run commands from within the package directory:

```bash
# Development
cd packages/container && npm start   # http://localhost:8080
cd packages/marketing && npm start   # http://localhost:8081

# Production build
cd packages/container && npm run build
cd packages/marketing && npm run build
```

Both `auth` and `dashboard` have no scripts beyond a placeholder `test` command yet.

## Architecture

### Module Federation Pattern

**Remote apps** (e.g., `marketing`) expose a `mount` function via `src/bootstrap.js`:
- `bootstrap.js` exports `mount(el)` which calls `ReactDOM.render()`
- In dev isolation mode, it auto-mounts if `#_marketing-dev-root` exists in the HTML
- The webpack config exposes `./MarketingApp → ./src/bootstrap`

**Container (host)** consumes remotes via wrapper components in `src/components/`:
- e.g., `MarketingApp.js` imports `{ mount } from 'marketing/MarketingApp'` and calls `mount(ref.current)` in a `useEffect`

### Dev vs Prod Webpack Configs

- `webpack.common.js` — shared Babel config + HtmlWebpackPlugin
- `webpack.dev.js` — remotes point to `http://localhost:<port>/remoteEntry.js`
- `webpack.prod.js` — remotes point to `${PRODUCTION_DOMAIN}/<app>/latest/remoteEntry.js`; output uses `[contenthash]` filenames

Container's prod build requires the `PRODUCTION_DOMAIN` environment variable.

## Deployment (CI/CD)

GitHub Actions workflows in `.github/workflows/` trigger on `push` to `main` for changes under the respective package path:

- **marketing**: builds → syncs to S3 at `<bucket>/marketing/latest/` → CloudFront invalidates `/marketing/latest/remoteEntry.js`
- **container**: builds → syncs to S3 at `<bucket>/container/latest/` → CloudFront invalidates `/container/latest/index.html`

Required GitHub Secrets: `AWS_S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DISTRIBUTION_ID`, `PRODUCTION_DOMAIN`.

S3 region: `ap-southeast-2`; CloudFront invalidation region: `us-east-2`.
