import { headers } from "next/headers";
import {
  buildPageMetadata,
  fetchStoreProduct,
  marketFromHeader,
  productHandleForLocale,
  productImageUrls,
  productSeoFallback,
} from "@/lib/seo";

/** Legacy /produkt/[handle] — metadata kept for redirect response; page permanently redirects. */
export async function generateMetadata({ params }) {
  const { handle, locale } = await params;
  const h = await headers();
  const market = marketFromHeader(h.get("x-trulo-market-prefix"), locale);
  if (!handle) return { title: "Trulo" };
  const product = await fetchStoreProduct(handle);
  if (!product) return { title: "Trulo" };
  const seo = productSeoFallback(product, locale);
  const title = (seo.title || handle).trim() || "Trulo";
  const description = seo.description || undefined;
  return buildPageMetadata({
    title,
    description,
    market,
    locale,
    pathForLocale: (loc) => productHandleForLocale(product, loc),
    images: productImageUrls(product),
  });
}

export default function ProductLayout({ children }) {
  return children;
}
