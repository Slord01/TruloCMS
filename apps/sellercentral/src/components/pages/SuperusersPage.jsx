"use client";
import { useEffect, useState } from 'react';
import { Page, Card, BlockStack, InlineStack, Text, TextField, Button, Banner, Badge } from '@shopify/polaris';
import { getMedusaAdminClient } from '@/lib/medusa-admin-client';
import { useLocale } from 'next-intl';

export default function SuperusersPage() {
  const locale = useLocale(); const title = locale === 'tr' ? 'Kullanıcılar' : locale === 'de' ? 'Benutzer' : 'Users';
  const [users, setUsers] = useState([]); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => getMedusaAdminClient().request('/admin-hub/users').then(data => setUsers(data.users));
  useEffect(() => { load().catch(failure => setError(failure.message)); }, []);
  async function create() { setBusy(true); setError(''); try { await getMedusaAdminClient().request('/admin-hub/users', { method: 'POST', body: JSON.stringify({ email, password }) }); setEmail(''); setPassword(''); await load(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  return <Page title={title}><BlockStack gap="400">{error && <Banner tone="critical">{error}</Banner>}<Banner>Trulo CMS · Superuser</Banner>
    <Card><BlockStack gap="300"><TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="off" /><TextField label={locale === 'tr' ? 'Yeni şifre (en az 12 karakter)' : locale === 'de' ? 'Neues Passwort (mind. 12 Zeichen)' : 'New password (12+ characters)'} type="password" value={password} onChange={setPassword} autoComplete="new-password" /><Button variant="primary" onClick={create} loading={busy} disabled={!email || password.length < 12}>Add superuser</Button></BlockStack></Card>
    {users.map(user => <Card key={user.id}><InlineStack align="space-between"><Text as="p">{user.email}</Text><Badge>Superuser</Badge></InlineStack></Card>)}
  </BlockStack></Page>;
}
