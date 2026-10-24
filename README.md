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
