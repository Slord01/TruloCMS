import { redirect } from "next/navigation";
export default async function Page({ params }) { const { locale } = await params; redirect(`/${locale}/login`); }
