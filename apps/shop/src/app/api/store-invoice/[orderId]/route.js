import { getCmsBackendUrl } from '@trulo/lib/cms-service';
import { NextResponse } from "next/server";

const getBackendUrl = () =>
  getCmsBackendUrl().replace(/\/$/, "");

export async function GET(request, { params }) {
  const { orderId } = params;
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${getBackendUrl()}/store/orders/${orderId}/invoice`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    }
    const pdf = await res.arrayBuffer();
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Rechnung-${orderId}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ message: "Invoice generation failed" }, { status: 500 });
  }
}
