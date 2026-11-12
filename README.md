# Yasser Sebti — Portfolio

Personal portfolio built with React 19, Vite, Tailwind CSS v4, GSAP, and a custom native WebGL2/OffscreenCanvas shader backdrop.

## Structure

- `src/App.jsx` — Main layout, GSAP mask zoom reveal, and hero choreography
- `src/components/` — `AtmosphericBackground.jsx`, `LoadingScreen.jsx`
- `src/webgl/` — `backgroundShaders.js`, `backgroundEngine.js`, `background.worker.js`
- `src/utils/` — `textReveal.js` row-mask typography reveal helpers
- `public/` — Served static assets (`/assets/logo.svg`, `/assets/myself-v2-cutout.webp`, `/fonts/`)
- `docs/` — Reference brand materials and raw source portrait

## Scripts

- `npm run dev` — Start Vite development server
- `npm run lint` — Run Oxlint checks
- `npm run build` — Build production bundle to `dist/`
- `npm run preview` — Preview production build locally
