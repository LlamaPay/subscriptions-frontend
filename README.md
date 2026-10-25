# LlamaPay Subscriptions

The dashboard where subscribers and receivers manage LlamaPay subscriptions, and the
`/subscribe` checkout page that merchants link to.

## Development

Install the dependencies:

```bash
pnpm install
```

Start the development server with HMR:

```bash
pnpm run dev
```

## Deployment

The app is an SPA deployed to Cloudflare Workers static assets. `pnpm run build`
prerenders the dashboard into `build/client/index.html` and writes the shell for
every other page to `build/client/__spa-fallback.html`. `worker.ts` serves that
shell for paths without a file, and answers `/subscriptions`, the JSON endpoint
other sites use to check legacy subscriptions.

Preview the production build locally:

```bash
pnpm run preview
```

Deploy (run `pnpm wrangler login` once first):

```bash
pnpm run deploy
```

### Safe App

The Safe App is the same deployment. Inside the Safe{Wallet} iframe the app
connects the Safe as the active account; Safe{Wallet} reads `manifest.json`,
which `public/_headers` serves with CORS. If the Safe App is registered on its
own domain, add that domain as a second custom domain on the Worker.
