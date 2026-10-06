import { getCmsBackendUrl } from '@trulo/lib/cms-service';
import { NextResponse } from "next/server";

const getBackendUrl = () =>
  getCmsBackendUrl().replace(/\/$/, "");

export async function GET() {
  const base = getBackendUrl();
  try {
    const res = await fetch(`${base}/store/metafield-definitions`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json({ definitions: {} }, { status: 200 });
    }
    const data = await res.json();
    return NextResponse.json(
      { definitions: data?.definitions || {} },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" } },
    );
  } catch {
    return NextResponse.json({ definitions: {} }, { status: 200 });
  }
}
