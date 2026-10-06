import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import StyledComponentsRegistry from "../registry";
import Providers from "@/components/Providers";
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCmsBackendUrl } from '@trulo/lib/cms-service';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = true;
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!locale || !routing.locales.includes(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const protectedPath = (await headers()).get('x-trulo-protected-path');
  if (protectedPath) {
    const token = (await cookies()).get('sc_token')?.value;
    let authenticated = false;
    try {
      if (token) {
        const response = await fetch(`${getCmsBackendUrl()}/admin-hub/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(5000),
        });
        authenticated = response.ok && (await response.json()).user?.role === 'superuser';
      }
    } catch { /* Fail closed if the backend is unavailable. */ }
    if (!authenticated) redirect(`/${locale}/login?next=${encodeURIComponent(protectedPath)}`);
  }

  let messages;
  try {
    messages = (await import(`../../../messages/${locale}.json`)).default;
  } catch {
    messages = (await import(`../../../messages/${routing.defaultLocale}.json`)).default;
  }
  if (!messages || typeof messages !== "object") messages = {};

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <StyledComponentsRegistry>
        <Providers>{children}</Providers>
      </StyledComponentsRegistry>
    </NextIntlClientProvider>
  );
}
