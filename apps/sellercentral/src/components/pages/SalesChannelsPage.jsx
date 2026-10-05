"use client";

import { useEffect, useState } from 'react';
import { Page, Card, TextField, Select, Button, Banner, BlockStack, InlineStack, Text, Badge, Modal } from '@shopify/polaris';
import { useLocale } from 'next-intl';
import { useSalesChannel } from '@/context/SalesChannelContext';
import { useUnsavedChanges } from '@/context/UnsavedChangesContext';
import { getMedusaAdminClient } from '@/lib/medusa-admin-client';
import { useSearchParams } from 'next/navigation';

const empty = { name: '', domain: '', hosting_provider: '', record_type: 'A', target: '', template: '' };
const copy = {
  en: { add: 'Add website', name: 'Website name', domain: 'Domain', hosting: 'Hosting provider', target: 'Hosting IP / CNAME target', template: 'Template identifier', save: 'Save', cancel: 'Cancel', edit: 'Edit', verify: 'Verify DNS and HTTPS', remove: 'Delete website', empty: 'No websites registered yet.', all: 'All websites', instructions: 'DNS and hosting setup', help: 'Enter the IP or target supplied by your hosting provider. Add these DNS records at your domain provider, connect the domain to your deployment, enable HTTPS and upload the marker file shown below. Registration alone does not publish a website.', pending: 'Choose a website to manage its settings and content. All is a combined, read-only view.', confirm: 'Delete this website and all its CMS settings and content? This cannot be undone.', draft: 'Draft', pending_dns: 'DNS pending', dns_verified: 'DNS verified · Deployment pending', active: 'Active', loading: 'Loading…' },
  de: { add: 'Website hinzufügen', name: 'Name der Website', domain: 'Domain', hosting: 'Hosting-Anbieter', target: 'Hosting-IP / CNAME-Ziel', template: 'Template-Kennung', save: 'Speichern', cancel: 'Abbrechen', edit: 'Bearbeiten', verify: 'DNS und HTTPS prüfen', remove: 'Website löschen', empty: 'Noch keine Websites registriert.', all: 'Alle Websites', instructions: 'DNS- und Hosting-Einrichtung', help: 'IP oder Ziel vom Hosting-Anbieter eintragen. Diese DNS-Einträge beim Domain-Anbieter anlegen, die Domain mit dem Deployment verbinden, HTTPS aktivieren und die unten angegebene Marker-Datei hochladen. Die Registrierung allein veröffentlicht keine Website.', pending: 'Website auswählen, um Einstellungen und Inhalte zu verwalten. All zeigt alle Websites schreibgeschützt.', confirm: 'Diese Website mit allen CMS-Einstellungen und Inhalten unwiderruflich löschen?', draft: 'Entwurf', pending_dns: 'DNS ausstehend', dns_verified: 'DNS bestätigt · Deployment ausstehend', active: 'Aktiv', loading: 'Wird geladen…' },
  tr: { add: 'Website ekle', name: 'Website adı', domain: 'Domain', hosting: 'Hosting sağlayıcısı', target: 'Hosting IP / CNAME hedefi', template: 'Template kimliği', save: 'Kaydet', cancel: 'İptal', edit: 'Düzenle', verify: 'DNS ve HTTPS doğrula', remove: 'Website sil', empty: 'Henüz website kaydedilmedi.', all: 'Tüm websiteler', instructions: 'DNS ve hosting kurulumu', help: 'Hosting sağlayıcınızın verdiği IP veya hedef adresini girin. Bu DNS kayıtlarını domain sağlayıcınızda oluşturun, domaini yayınınıza bağlayın, HTTPS açın ve aşağıdaki doğrulama dosyasını yükleyin. Website kaydı tek başına siteyi yayına almaz.', pending: 'Ayar ve içerik yönetimi için bir website seçin. All bütün websiteleri salt okunur olarak gösterir.', confirm: 'Bu website ve ona ait tüm CMS ayarları ve içerikleri silinsin mi? Bu işlem geri alınamaz.', draft: 'Taslak', pending_dns: 'DNS bekleniyor', dns_verified: 'DNS doğrulandı · Yayın bekleniyor', active: 'Aktif', loading: 'Yükleniyor…' },
};

export default function SalesChannelsPage() {
  const locale = useLocale(); const t = copy[locale] || copy.en;
  const { channels, selectedId, select, refresh, error: loadError } = useSalesChannel();
  const unsaved = useUnsavedChanges();
  const search = useSearchParams();
  const [editing, setEditing] = useState(search.get('add') === '1' ? 'new' : null);
  const [form, setForm] = useState(empty);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);
  useEffect(() => {
    unsaved?.setDirty(dirty);
    return () => unsaved?.setDirty(false);
  }, [dirty, unsaved?.setDirty]);
  function begin(channel) {
    if (dirty && !window.confirm(t.cancel + '?')) return;
    setEditing(channel?.id || 'new'); setForm(channel ? { ...empty, ...channel } : empty); setDirty(false); setError('');
  }
  function change(key, value) { setForm(previous => ({ ...previous, [key]: value })); setDirty(true); }
  async function save() {
    setBusy(true); setError('');
    try {
      await getMedusaAdminClient().request(`/admin-hub/sales-channels${editing === 'new' ? '' : `/${editing}`}`, { method: editing === 'new' ? 'POST' : 'PATCH', body: JSON.stringify(form) });
      await refresh(); setEditing(null); setDirty(false); return true;
    } catch (failure) { setError(failure.message); return false; } finally { setBusy(false); }
  }
  useEffect(() => {
    unsaved?.setHandlers({ onSave: save, onDiscard: () => { setEditing(null); setDirty(false); } });
    return () => unsaved?.clearHandlers();
  }, [form, editing, refresh, unsaved?.setHandlers, unsaved?.clearHandlers]);
  async function verify(channel) {
    setBusy(true); setError('');
    try { await getMedusaAdminClient().request(`/admin-hub/sales-channels/${channel.id}/verify`, { method: 'POST' }); await refresh(); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try {
      if (selectedId === deleting.id) select('all');
      await getMedusaAdminClient().request(`/admin-hub/sales-channels/${deleting.id}`, { method: 'DELETE' });
      await refresh(); if (editing === deleting.id) { setEditing(null); setDirty(false); } setDeleting(null);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <Page title="Sales Channels" primaryAction={{ content: t.add, onAction: () => begin(null), disabled: busy }}>
    <BlockStack gap="400">
      {(error || loadError) && <Banner tone="critical">{error || loadError}</Banner>}
      <Banner>{t.pending}</Banner>
      <Card><Select label="Website" value={selectedId} options={[{ label: 'All', value: 'all' }, ...channels.map(channel => ({ label: channel.name, value: channel.id }))]} onChange={select} disabled={dirty || busy} /></Card>
      {editing && <Card><BlockStack gap="400">
        <Text as="h2" variant="headingMd">{editing === 'new' ? t.add : t.edit}</Text>
        <TextField label={t.name} value={form.name} onChange={value => change('name', value)} autoComplete="off" />
        <TextField label={t.domain} value={form.domain} onChange={value => change('domain', value)} placeholder="www.example.com" autoComplete="off" helpText="Domain only; no https:// or path." />
        <TextField label={t.hosting} value={form.hosting_provider} onChange={value => change('hosting_provider', value)} autoComplete="off" />
        <Select label="DNS record" options={['A', 'AAAA', 'CNAME']} value={form.record_type} onChange={value => change('record_type', value)} />
        <TextField label={t.target} value={form.target} onChange={value => change('target', value)} autoComplete="off" />
        <TextField label={t.template} value={form.template} onChange={value => change('template', value)} autoComplete="off" />
        <InlineStack gap="300"><Button variant="primary" loading={busy} onClick={save}>{t.save}</Button><Button disabled={busy} onClick={() => { if (!dirty || window.confirm(t.cancel + '?')) { setEditing(null); setDirty(false); } }}>{t.cancel}</Button></InlineStack>
      </BlockStack></Card>}
      {!channels.length && !loadError && <Card><Text as="p">{t.empty}</Text></Card>}
      {channels.map(channel => <Card key={channel.id}><BlockStack gap="400">
        <InlineStack align="space-between"><Text as="h2" variant="headingMd">{channel.name}</Text><Badge tone={channel.status === 'active' ? 'success' : 'attention'}>{t[channel.status] || t.draft}</Badge></InlineStack>
        <Text as="p">{channel.domain} · {channel.hosting_provider || '—'} · {channel.template || '—'}</Text>
        <InlineStack gap="300"><Button onClick={() => select(channel.id)} disabled={dirty || busy}>Website: {channel.name}</Button><Button onClick={() => begin(channel)} disabled={busy}>{t.edit}</Button><Button onClick={() => verify(channel)} disabled={busy || !channel.target}>{t.verify}</Button><Button tone="critical" onClick={() => setDeleting(channel)} disabled={busy}>{t.remove}</Button></InlineStack>
        <Text as="h3" variant="headingSm">{t.instructions}</Text><Text as="p">{t.help}</Text>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}><thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead><tbody>{channel.dns_records?.map(record => <tr key={record.type}><td style={{ padding: 8 }}>{record.type}</td><td style={{ padding: 8 }}>{record.name}</td><td style={{ padding: 8, overflowWrap: 'anywhere' }}><code>{record.value}</code></td></tr>)}</tbody></table></div>
        <Text as="p">HTTPS file: <code>{channel.deployment_marker?.path}</code></Text>
        <Text as="p">File contents: <code style={{ overflowWrap: 'anywhere' }}>{channel.deployment_marker?.value}</code></Text>
        {channel.verification_message && <Banner tone={channel.status === 'active' ? 'success' : 'info'}>{channel.verification_message}</Banner>}
        {channel.checked_at && <Text as="p" tone="subdued">{new Date(channel.checked_at).toLocaleString(locale)}</Text>}
      </BlockStack></Card>)}
    </BlockStack>
    <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title={t.remove} primaryAction={{ content: t.remove, destructive: true, loading: busy, onAction: remove }} secondaryActions={[{ content: t.cancel, onAction: () => setDeleting(null), disabled: busy }]}><Modal.Section><Text as="p">{t.confirm}</Text><Text as="p">{deleting?.name}</Text></Modal.Section></Modal>
  </Page>;
}
