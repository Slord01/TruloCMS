# Trulo cloud deployment

Approved architecture: current Shopware sites stay at Profihost. Trulo application
services run on Vercel, the CMS database on Render PostgreSQL, and public product
images on Cloudflare R2. These files prepare deployment; no cloud resources have
been created and no existing Shopware sites or DNS records have been changed.

## 1. Render database

Review and import the root `render.yaml` Blueprint. It defines only a PostgreSQL
database in Frankfurt, PostgreSQL 17, the smallest paid compute plan, and 1 GB
storage. This is an initial CMS development capacity, not a production capacity
estimate for five storefronts. Applying the Blueprint incurs Render charges.
Increase capacity before production according to measured load and connection use.

Copy the **external** database URL into the Vercel project's encrypted environment
settings as `DATABASE_URL`. The Render internal URL is for services within Render;
Vercel cannot use it. Use a different database for previews so preview edits never
change production content. The CMS requires TLS with certificate verification for
remote connections, and limits each instance's pool to two connections by default.
`CMS_DATABASE_POOL_MAX` may be set between 1 and 10. Size total database connections
against the number of Vercel instances; a per-instance pool is not a global limit.

On first runtime initialization the backend applies versioned SQL migrations under
a PostgreSQL transaction/advisory lock. It persists one shared JWT signing key in
the database. Database access is lazy, so builds do not need DATABASE_URL or read
CMS data. A missing/failed database returns 503 rather than silently using SQLite.
Local development and isolated tests can still use SQLite without DATABASE_URL.
Existing local SQLite data is preserved; it is not automatically imported into
the new PostgreSQL database.

Create the first account from a trusted local shell with the same database URL
in the ignored `apps/cms-backend/.env`, then run `npm run admin:create`. This script
prompts for your own email/password and creates only a superuser. Do not leave
CMS_ADMIN_PASSWORD in deployed environment settings. No default accounts exist.

## 2. Cloudflare R2 images

Create a dedicated R2 bucket for **public product/CMS images**, e.g. `trulo-cms-media`.
Connect a media subdomain you own to that bucket in Cloudflare. Use this HTTPS URL
as `R2_PUBLIC_BASE_URL`; do not use the S3 API endpoint as the public media URL.
Do not put invoices, customer documents, secrets, or other private files here.

Create R2 S3 API credentials with object read/write permissions restricted to this
bucket. Configure these server-only Vercel environment variables:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_BASE_URL
```

The account ID determines the standard R2 S3 endpoint. This implementation targets
standard buckets, not jurisdiction-specific endpoint variants.

Set bucket CORS using `infrastructure/r2-cors.example.json`: replace
`https://YOUR-CMS-DOMAIN` with the real CMS origin; add explicitly allowed preview
origins if needed, and remove localhost in production. Set the staging expiration
rule from `infrastructure/r2-lifecycle.example.json` using the S3 lifecycle interface,
or add the equivalent `staging/` / one-day expiration rule in the dashboard. Merge
these policies into existing rules if reusing a bucket; never replace unrelated
policies. A dedicated bucket is preferable.

Uploads require a signed superuser and one selected website. The browser requests
a five-minute PUT URL, uploads directly to R2 without sending its CMS token, then
completes the upload through the CMS. The backend checks the actual file size and
decodes the image, applies orientation, removes metadata, and generates a WebP up
to 4096 × 4096. JPEG/PNG/WebP/AVIF/GIF images up to 15 MB are accepted. Animated
inputs currently publish their first frame. Videos and arbitrary files are not
implemented. Publication uses a different immutable object key so an old signed
URL cannot overwrite an already-published image. Media records/folders are scoped
to websites; All is read-only. Image deletion removes the R2 object.

Abandoned staging objects expire with the lifecycle rule. Website deletion also
removes its known R2 objects before deleting the database records. If storage
cleanup fails, deletion stops and can be retried; already-removed objects are safe
to delete again. Unexpected termination during completion can
leave an in-progress upload; selecting/uploading the file again creates a new
attempt. These cleanup cases need operational follow-up before large-scale use.

## 3. Vercel deployment

Import the repository at its root; root `vercel.json` defines the five services.
Keep `CMS_BACKEND_URL` unset: Vercel injects it through each service binding.
`NEXT_PUBLIC_CMS_BACKEND_URL` is a same-origin proxy path compiled in Next config,
not the private service address. No database or R2 secret may have NEXT_PUBLIC_ prefix.

Choose Frankfurt for function execution (backend and CMS routes also request
`fra1`). Configure `NEXT_PUBLIC_SITE_URL` to the shop's complete public URL including
`/shop`. Current public paths are CMS `/`, shop `/shop`, affiliate `/affiliate`, and
developer `/developer`; `cms-backend` has no direct public ingress.

Account access/credentials are not connected in this workspace. Before declaring
deployment complete, test a preview against the real Render database/R2 bucket:
create an account, log in, upload an image, refresh/redeploy, verify persistence,
verify site isolation, and delete the test image. Do not redirect live Shopware
domains until the storefront/checkout/Shopware integration is complete.

## References

- [Render connections](https://render.com/docs/postgresql-creating-connecting)
- [Render Blueprint fields](https://render.com/docs/blueprint-spec)
- [R2 signed requests](https://developers.cloudflare.com/r2/examples/aws/aws4fetch/)
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 public domains](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [R2 staging lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
