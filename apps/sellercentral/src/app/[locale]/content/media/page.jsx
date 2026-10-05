"use client";

import { Suspense } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import MediaPage from "@/components/pages/content/MediaPage";

export default function ContentMedia() {
  return (
    <DashboardLayout>
      <Suspense>
        <MediaPage />
      </Suspense>
    </DashboardLayout>
  );
}
