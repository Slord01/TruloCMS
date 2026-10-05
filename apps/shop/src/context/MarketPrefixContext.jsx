"use client";

import { createContext, useContext } from "react";

const MarketPrefixContext = createContext(null);

export function MarketPrefixProvider({ value, children }) {
  return <MarketPrefixContext.Provider value={value}>{children}</MarketPrefixContext.Provider>;
}

/** Public market path prefix from middleware (e.g. /de/en/eur), or null if unset. */
export function useMarketPrefix() {
  return useContext(MarketPrefixContext);
}
