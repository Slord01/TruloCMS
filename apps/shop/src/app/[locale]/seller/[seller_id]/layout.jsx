import { getCmsBackendUrl } from '@trulo/lib/cms-service';
import { headers } from "next/headers";
import SeoJsonLd from "@/components/SeoJsonLd";
import { absolutePublicUrl, buildPageMetadata, buildSellerJsonLd, marketFromHeader, stripHtml } from "@/lib/seo";

const BASE = () => getCmsBackendUrl();

export async function generateMetadata({ params }) {
  const { seller_id: sellerId, locale } = await params;
  const h = await headers();
  const market = marketFromHeader(h.get("x-trulo-market-prefix"), locale);
  if (!sellerId) return { title: "Trulo" };

  try {
    const res = await fetch(
      `${BASE()}/store/seller-profile/${encodeURIComponent(sellerId)}`,
      { next: { revalidate: 120 } },
    );
    const data = res.ok ? await res.json().catch(() => ({})) : {};
    const seller = data?.seller || data?.profile || data || {};
    const name = (
      seller.store_name ||
      seller.name ||
      seller.shop_name ||
      sellerId
    )
      .toString()
      .trim();
    const description =
      stripHtml(seller.description || seller.about || "", 160) ||
      `${name} on Trulo`;
    return buildPageMetadata({
      title: `${name} | Trulo`,
      description,
      market,
      locale,
      path: `seller/${sellerId}`,
      images: [seller.logo || seller.logo_image || seller.avatar].filter(Boolean),
    });
  } catch {
    return buildPageMetadata({
      title: "Seller | Trulo",
      market,
      locale,
      path: `seller/${sellerId}`,
    });
  }
}

export default async function SellerLayout({ children, params }) {
  const { seller_id: sellerId, locale } = await params;
  const h = await headers();
  const market = marketFromHeader(h.get("x-trulo-market-prefix"), locale);

  let jsonLd = null;
  if (sellerId) {
    try {
      const res = await fetch(
        `${BASE()}/store/seller-profile/${encodeURIComponent(sellerId)}`,
        { next: { revalidate: 120 } },
      );
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      const seller = data?.seller || null;
      if (seller?.store_name) {
        const canonicalUrl = absolutePublicUrl(market, locale, `seller/${sellerId}`);
        jsonLd = buildSellerJsonLd(seller, { locale, market, canonicalUrl });
      }
    } catch {
      /* no JSON-LD for this request — metadata above already has a safe fallback */
    }
  }

  return (
    <>
      <SeoJsonLd data={jsonLd} />
      {children}
    </>
  );
}
