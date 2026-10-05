"use client";
import { useEffect, useState } from 'react';
import { Banner, BlockStack, Button, Card, Text } from '@shopify/polaris';
import { useSalesChannel } from '@/context/SalesChannelContext';
import { getMedusaAdminClient } from '@/lib/medusa-admin-client';
import { useLocale } from 'next-intl';

export default function AllWebsiteSettings() {
  const { channels, select } = useSalesChannel();
  const [settings, setSettings] = useState([]); const [error, setError] = useState('');
  const locale = useLocale();
  const title = locale === 'tr' ? 'Tüm website ayarları' : locale === 'de' ? 'Einstellungen aller Websites' : 'All website settings';
  const description = locale === 'tr' ? 'Ayarları değiştirmek için bir website seçin.' : locale === 'de' ? 'Zum Bearbeiten eine Website auswählen.' : 'Select a website to edit its settings.';
  useEffect(() => { getMedusaAdminClient().request('/admin-hub/seller-settings').then(data => setSettings(data.sales_channels_settings || [])).catch(failure => setError(failure.message)); }, []);
  return <BlockStack gap="400"><Text as="h2" variant="headingLg">{title}</Text><Banner>{description}</Banner>{error && <Banner tone="critical">{error}</Banner>}
    {!channels.length && <Button url="/sales-channels">Sales Channels</Button>}
    {channels.map(channel => { const value = settings.find(item => item.sales_channel_id === channel.id) || {}; return <Card key={channel.id}><BlockStack gap="300">
      <Text as="h3" variant="headingMd">{channel.name}</Text><Text as="p">{channel.domain}</Text>
      <Text as="p">{value.store_name || '—'} · {value.locale || '—'} · {value.storefront_url || '—'}</Text>
      <Button onClick={() => select(channel.id)}>{channel.name}</Button>
    </BlockStack></Card>; })}
  </BlockStack>;
}
