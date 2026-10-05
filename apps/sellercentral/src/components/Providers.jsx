"use client";

import "@/lib/tab-scoped-auth-storage";
import { UnsavedChangesProvider } from "@/context/UnsavedChangesContext";
import { SalesChannelProvider } from "@/context/SalesChannelContext";

export default function Providers({ children }) {
  return (
    <UnsavedChangesProvider>
      <SalesChannelProvider>
        {children}
      </SalesChannelProvider>
    </UnsavedChangesProvider>
  );
}
