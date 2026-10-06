import { NextResponse } from "next/server";
export async function GET(request) { return NextResponse.redirect(new URL("/shop/trulo-icon.svg", request.url)); }
