# arkhe-chain landing (GitHub Pages)

Static presentation site for [arkhe-chain](https://github.com/rafael-arkhe/arkhe-chain).

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4 (`@tailwindcss/vite`)
- [Motion](https://motion.dev/) micro-interactions

## Amicro components

We intended `npx shadcn@latest add @amicro/<name>`. The Amicro registry returned **HTTP 429** during setup, so four patterns live under `src/components/amicro/` as **vendored MIT equivalents** aligned with [Amicro](https://amicro.dev/) docs (spring magnetic button, blur reveal, pulse dots, mono status bars). Replace with CLI copies when the registry is reachable:

```bash
npx shadcn@latest add @amicro/magnetic-button @amicro/blur-reveal @amicro/pulse-dots
```

## Local development

```bash
npm install
npm run dev
```

Preview with the same base path as GitHub Pages:

```bash
npm run build
npm run preview
```

Open `http://localhost:4173/arkhe-chain/`.

## GitHub Pages

Workflow: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml).

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main` runs the workflow; artifact is the Vite `dist/` output.

**Live URL (project site):** `https://rafael-arkhe.github.io/arkhe-chain/`

`vite.config.ts` sets `base: '/arkhe-chain/'` for that layout.

## Copy and claims

Site copy is en-US and matches the crate README / gate record. It does **not** claim homologation; A3/A4 remain PENDING.