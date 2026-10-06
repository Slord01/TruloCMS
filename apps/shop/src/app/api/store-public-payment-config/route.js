import { getCmsBackendUrl } from '@trulo/lib/cms-service';
import { NextResponse } from "next/server";

const getBackendUrl = () =>
  getCmsBackendUrl().replace(/\/$/, "");

export async function GET() {
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/public-payment-config`, { next: { revalidate: 1800 } });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: res.ok ? 200 : res.status,
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ stripe_publishable_key: null, payment_method_types: ["card"] }, { status: 200 });
  }
}
