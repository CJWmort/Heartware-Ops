# Client (Vue 3 + Vite + Bootstrap)

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:5173  (start the server too: cd ../server && npm run dev)
npm run test:unit      # Vitest
npm run test:e2e       # Playwright (desktop + iPhone 6 sizes)
npm run lint           # fix lint problems
npm run build          # production build into dist/ (dist/index.html is the entry page)
```

**Can't log in yet?** In `npm run dev`, the login page has a *Dev shortcut* box to enter as a
volunteer, coordinator or HQ user without the server. It disappears in the production build.

Where things go:

| Folder | What |
|---|---|
| `src/views/volunteer/`, `src/views/admin/` | One file per page (each has a yellow "To build" box listing its TODOs) |
| `src/components/` | Reusable pieces: `PageHeader`, `BaseMap` (Leaflet), `FeaturePlaceholder` |
| `src/services/` | One file per feature with every API call already written as a function |
| `src/stores/auth.js` | Logged-in user (`useAuthStore()`) |
| `src/router/` | URLs, role guards, navbar links |
| `src/utils/constants.js` | Checkpoints, venues, shapes – shared values |
| `e2e/` | One Playwright spec per feature. Tests marked `test.fixme` are waiting for the feature. |

Deploying to Vercel: root directory `client`, build command `npm run build`, output `dist`,
environment variable `VITE_API_BASE_URL=https://<render-app>.onrender.com/api`.
