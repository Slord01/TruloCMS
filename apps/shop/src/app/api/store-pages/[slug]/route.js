import { getCmsBackendUrl } from '@trulo/lib/cms-service';
import { NextResponse } from "next/server";

const getBackendUrl = () =>
  getCmsBackendUrl().replace(/\/$/, "");

export async function GET(request, { params }) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ message: "Not found" }, { status: 404 });
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/pages/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ message: "Not found" }, { status: 404 });
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
}
