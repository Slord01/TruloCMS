"use client";

import DashboardLayout from "@/components/DashboardLayout";
import AbandonedCheckoutsPage from "@/components/pages/orders/AbandonedCheckoutsPage";

export default function AbandonedCheckouts() {
  return (
    <DashboardLayout>
      <AbandonedCheckoutsPage />
    </DashboardLayout>
  );
}
