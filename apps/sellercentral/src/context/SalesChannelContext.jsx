"use client";

import { Fragment, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getMedusaAdminClient } from '@/lib/medusa-admin-client';
import { installChannelFetch, selectedChannelId, SALES_CHANNEL_KEY, SALES_CHANNEL_EVENT } from '@/lib/sales-channel-storage';

installChannelFetch();
const Context = createContext(null);

export function SalesChannelProvider({ children }) {
  const [channels, setChannels] = useState([]);
  const [selectedId, setSelectedId] = useState('all');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await getMedusaAdminClient().request('/admin-hub/sales-channels');
      setChannels(response.sales_channels || []); setError('');
      const id = selectedChannelId();
      if (id !== 'all' && !response.sales_channels?.some(channel => channel.id === id)) {
        sessionStorage.removeItem(SALES_CHANNEL_KEY); setSelectedId('all');
      }
      return response.sales_channels || [];
    } catch (failure) { setError(failure.message); throw failure; }
  }, []);
  useEffect(() => {
    setSelectedId(selectedChannelId()); setReady(true);
    if (localStorage.getItem('sellerToken')) refresh().catch(() => {});
  }, [refresh]);
  const select = useCallback((id) => {
    if (id !== 'all' && !channels.some(channel => channel.id === id)) return;
    sessionStorage.setItem(SALES_CHANNEL_KEY, id); setSelectedId(id);
    window.dispatchEvent(new CustomEvent(SALES_CHANNEL_EVENT, { detail: id }));
    // Remounting all screens avoids displaying cached data from the old website.
    // Selection persists per browser tab and never changes user credentials.
  }, [channels]);
  return <Context.Provider value={{ channels, selectedId, selected: channels.find(channel => channel.id === selectedId), select, refresh, ready, error }}>
    {ready ? <Fragment key={selectedId}>{children}</Fragment> : null}
  </Context.Provider>;
}

export function useSalesChannel() {
  const value = useContext(Context);
  if (!value) throw new Error('SalesChannelProvider is required.');
  return value;
}
