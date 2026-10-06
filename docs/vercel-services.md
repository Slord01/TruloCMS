# Vercel services configuration

The repository root is a workspace, not an application. `packages/ui` is a shared
component library, not a deployable Vite service. The root `vercel.json` therefore
defines five services.

Each service installs from the root frozen npm lockfile with
`npm ci --legacy-peer-deps`. This preserves the existing workspace graph instead
of re-resolving unrelated dependencies during cloud builds.

| Service | Public ingress | Calls |
| --- | --- | --- |
| sellercentral | `/` (catch-all, including locale routes) | cms-backend |
| shop | `/shop` | cms-backend |
| affiliate | `/affiliate` | cms-backend |
| developer | `/developer` | cms-backend |
| cms-backend | Internal only | None |

The Vercel + Render PostgreSQL + Cloudflare R2 architecture is approved.
Each frontend has a `CMS_BACKEND_URL` service binding. Do not manually set that
variable in Vercel or any environment file. Browser calls use the application's
same-origin `/api/cms` route, including its basePath. The proxy preserves bearer
authentication and website scope, and forwards only the namespaces that the app
uses. Internal networking does not replace application authentication.

Backend URL lookup is lazy, inside server requests. Next middleware only checks
for the session cookie; the sellercentral server layout verifies it with the
backend. Dynamic rendering prevents CMS data reads during static generation.
`NEXT_PUBLIC_CMS_BACKEND_URL` is set to the public proxy path in each Next config;
it never contains a private binding URL.

## Required before deployment

The backend now supports Render PostgreSQL through the server-only `DATABASE_URL`.
Runtime initialization applies versioned migrations, keeps the JWT signing key
durable, and uses a bounded connection pool with verified TLS. Missing/failed
database configuration returns 503; SQLite is reserved for local development/tests.

Cloudflare R2 uploads use short-lived signed PUT URLs, image validation and WebP
publication, with website-scoped media records and folders. Render/R2 credentials,
domains, CORS, and lifecycle policies still need to be configured in the cloud
accounts. See [the deployment guide](cloud-deployment.md) for the exact steps.
No cloud resources have been provisioned or tested against real provider accounts.

Affiliate, developer, and advanced store APIs inherited from the copied project
are still not implemented in the new CMS backend; service bindings do not add
those features. They must not be presented as working integrations.

Use `NEXT_PUBLIC_SITE_URL` for the shop's absolute public URL, including `/shop`,
when assigning a custom domain. Without it, preview metadata uses Vercel's
deployment URL plus `/shop`. Images use the R2 public media URL configured on the
backend; public URLs never contain private binding addresses.

## Verification

Run `node --test scripts/service-bindings.test.mjs`, the four Next builds,
`npm run test:cms-ui`, and `node e2e/services.smoke.cjs`. The latter verifies public
prefixes, login pages, prefixed assets, binding-backed proxies, and namespace isolation.
Run `npm run test:postgres --workspace=@trulo/cms-backend` to exercise the same
backend contracts/migrations against the PostgreSQL engine in PGlite. This does
not validate a live Render TLS/network connection or a real R2 bucket.
For Vercel integration testing use a current Services-aware
CLI: `vercel dev -L`. The installed CLI (48.12.0) requires a Vercel login; the
attempt to download `vercel@latest` failed with npm ETARGET for 62.4.0.
The full Vercel integration test has therefore not passed in this workspace.

References: [services](https://vercel.com/docs/services),
[bindings](https://vercel.com/docs/services/bindings),
[routing](https://vercel.com/docs/services/routing),
[SQLite limitations](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
