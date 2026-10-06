import { getCmsBackendUrl } from '@trulo/lib/cms-service';
import { NextResponse } from "next/server";

const getBackendUrl = () =>
  getCmsBackendUrl().replace(/\/$/, "");

export async function GET() {
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/pages`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ pages: [], count: 0 }, { status: 200 });
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ pages: [], count: 0 }, { status: 200 });
  }
}
