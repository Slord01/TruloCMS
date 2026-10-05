"use client";
import { useCallback, useEffect, useState } from 'react';
import { Banner, BlockStack, Button, Card, Checkbox, InlineStack, Select, Text, TextField } from '@shopify/polaris';
import { useLocale } from 'next-intl';
import { useSalesChannel } from '@/context/SalesChannelContext';
import { useUnsavedChanges } from '@/context/UnsavedChangesContext';
import { getMedusaAdminClient } from '@/lib/medusa-admin-client';

const fields = {
  en: { title: 'Website settings', store_name: 'Website display name', storefront_url: 'Storefront URL', shop_logo_url: 'Website logo URL', shop_favicon_url: 'Website favicon URL', legal_company_name: 'Company name', legal_representative: 'Representative', legal_street: 'Street and house number', legal_city: 'Postal code and city', legal_email: 'Contact email', legal_vat_id: 'VAT number', maintenance_mode_enabled: 'Maintenance mode', save: 'Save', reset: 'Discard', saved: 'Website settings saved.' },
  de: { title: 'Website-Einstellungen', store_name: 'Anzeigename der Website', storefront_url: 'Website-URL', shop_logo_url: 'Website-Logo-URL', shop_favicon_url: 'Website-Favicon-URL', legal_company_name: 'Firmenname', legal_representative: 'Vertretungsberechtigte Person', legal_street: 'Straße und Hausnummer', legal_city: 'Postleitzahl und Ort', legal_email: 'Kontakt-E-Mail', legal_vat_id: 'USt-IdNr.', maintenance_mode_enabled: 'Wartungsmodus', save: 'Speichern', reset: 'Verwerfen', saved: 'Website-Einstellungen gespeichert.' },
  tr: { title: 'Website ayarları', store_name: 'Website görünen adı', storefront_url: 'Website URL', shop_logo_url: 'Website logo URL', shop_favicon_url: 'Website favicon URL', legal_company_name: 'Firma adı', legal_representative: 'Yetkili kişi', legal_street: 'Sokak ve kapı numarası', legal_city: 'Posta kodu ve şehir', legal_email: 'İletişim e-postası', legal_vat_id: 'KDV numarası', maintenance_mode_enabled: 'Bakım modu', save: 'Kaydet', reset: 'Vazgeç', saved: 'Website ayarları kaydedildi.' },
};
const keys = ['store_name', 'storefront_url', 'shop_logo_url', 'shop_favicon_url', 'legal_company_name', 'legal_representative', 'legal_street', 'legal_city', 'legal_email', 'legal_vat_id'];
export default function WebsiteGeneralSettings() {
  const locale = useLocale(); const t = fields[locale] || fields.en;
  const { selected, selectedId } = useSalesChannel(); const unsaved = useUnsavedChanges();
  const [form, setForm] = useState({}); const [baseline, setBaseline] = useState(null);
  const [error, setError] = useState(''); const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false);
  const dirty = baseline !== null && JSON.stringify(form) !== JSON.stringify(baseline);
  useEffect(() => {
    let cancelled = false;
    getMedusaAdminClient().request('/admin-hub/seller-settings').then(value => { if (!cancelled) { setForm(value); setBaseline(value); } }).catch(failure => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [selectedId]);
  const save = useCallback(async () => {
    setBusy(true); setError('');
    try {
      for (const key of ['storefront_url', 'shop_logo_url', 'shop_favicon_url']) {
        if (form[key] && new URL(form[key]).protocol !== 'https:') throw new Error(`${t[key]}: HTTPS URL required.`);
      }
      const value = await getMedusaAdminClient().request('/admin-hub/seller-settings', { method: 'PATCH', body: JSON.stringify(form) });
      setForm(value); setBaseline(value); setSaved(true); return true;
    } catch (failure) { setError(failure.message); return false; } finally { setBusy(false); }
  }, [form, t]);
  const discard = useCallback(() => { if (baseline) setForm(baseline); setSaved(false); }, [baseline]);
  useEffect(() => { unsaved?.setDirty(dirty); }, [dirty, unsaved?.setDirty]);
  useEffect(() => {
    unsaved?.setHandlers({ onSave: save, onDiscard: discard });
    return () => unsaved?.clearHandlers();
  }, [save, discard, unsaved?.setHandlers, unsaved?.clearHandlers]);
  useEffect(() => () => unsaved?.setDirty(false), [unsaved?.setDirty]);
  function change(key, value) { setForm(previous => ({ ...previous, [key]: value })); setSaved(false); }
  return <BlockStack gap="400"><Text as="h1" variant="headingLg">{t.title} · {selected?.name}</Text>
    {error && <Banner tone="critical">{error}</Banner>}{saved && <Banner tone="success">{t.saved}</Banner>}
    <Card><BlockStack gap="400">{keys.map(key => <TextField key={key} label={t[key]} value={String(form[key] || '')} onChange={value => change(key, value)} autoComplete="off" disabled={baseline === null || busy} />)}
      <Select label="Language" value={form.locale || 'de'} options={[{ label: 'Deutsch', value: 'de' }, { label: 'English', value: 'en' }, { label: 'Türkçe', value: 'tr' }, { label: 'Français', value: 'fr' }, { label: 'Español', value: 'es' }, { label: 'Italiano', value: 'it' }]} onChange={value => change('locale', value)} disabled={baseline === null || busy} />
      <Checkbox label={t.maintenance_mode_enabled} checked={form.maintenance_mode_enabled === true} onChange={value => change('maintenance_mode_enabled', value)} disabled={baseline === null || busy} />
      <InlineStack gap="300"><Button variant="primary" onClick={save} loading={busy} disabled={!dirty}>{t.save}</Button><Button onClick={discard} disabled={!dirty || busy}>{t.reset}</Button></InlineStack>
    </BlockStack></Card>
  </BlockStack>;
}
