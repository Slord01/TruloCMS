const dns = require('node:dns/promises');
const net = require('node:net');
const https = require('node:https');
const { domainToASCII } = require('node:url');

function domainName(input) {
  const raw = String(input || '').trim().toLowerCase().replace(/\.$/, '');
  if (/[\s/:@?#\\]/.test(raw)) throw new Error('Enter a domain without protocol, path or port.');
  const domain = domainToASCII(raw);
  if (!domain || domain.length > 253 || !domain.includes('.') || net.isIP(domain) ||
      domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      /\.(local|localhost|internal|invalid|test)$/.test(domain)) {
    throw new Error('Enter a public domain name without protocol, path or port.');
  }
  return domain;
}

function publicIp(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 2))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  // Only global unicast IPv6. Exclude documentation and mapped/private ranges.
  if (net.isIP(ip) !== 6 || ip.includes('%')) return false;
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [first, second = '0'] = canonical.split(':');
  const secondWord = parseInt(second || '0', 16);
  return /^[23]/i.test(canonical) && first !== '2002' && first !== '3fff' &&
    !(first === '2001' && (secondWord < 0x200 || secondWord === 0xdb8));
}

function normalizeChannel(body, previous = {}) {
  const name = String(body.name ?? previous.name ?? '').trim();
  if (!name || name.length > 120) throw new Error('Website name is required (maximum 120 characters).');
  const domain = domainName(body.domain ?? previous.domain);
  const record_type = String(body.record_type ?? previous.record_type ?? 'A').toUpperCase();
  if (!['A', 'AAAA', 'CNAME'].includes(record_type)) throw new Error('Choose A, AAAA or CNAME.');
  let target = String(body.target ?? previous.target ?? '').trim();
  if (target) {
    if (record_type === 'CNAME') {
      target = domainName(target);
      if (target === domain) throw new Error('CNAME target must be different from the website domain.');
    } else if (net.isIP(target) !== (record_type === 'A' ? 4 : 6) || !publicIp(target)) {
      throw new Error('Enter a public hosting IP address matching the DNS record type.');
    }
  }
  return {
    name, domain, record_type, target,
    hosting_provider: String(body.hosting_provider ?? previous.hosting_provider ?? '').trim().slice(0, 120),
    template: String(body.template ?? previous.template ?? '').trim().slice(0, 120),
  };
}

function dnsInstructions(channel) {
  return [
    ...(channel.target ? [{ type: channel.record_type, name: channel.domain, value: channel.target }] : []),
    { type: 'TXT', name: `_trulo-cms.${channel.domain}`, value: `trulo-verification=${channel.verification_token}` },
  ];
}

function deploymentMarker(channel, address) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: channel.domain, path: '/.well-known/trulo-cms.txt', port: 443,
      servername: channel.domain, timeout: 8000,
      // Pin the validated DNS address to prevent rebinding or private-network access.
      lookup: (_hostname, options, callback) => options?.all
        ? callback(null, [address]) : callback(null, address.address, address.family),
    }, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTPS deployment marker must return HTTP 200 without redirects.')); return; }
      let text = '';
      res.on('data', chunk => { text += chunk; if (text.length > 2048) res.destroy(new Error('Deployment marker is too large.')); });
      res.on('error', reject);
      res.on('end', () => resolve(text.trim() === channel.verification_token));
    });
    req.on('timeout', () => req.destroy(new Error('HTTPS verification timed out.')));
    req.on('error', reject);
  });
}

async function verifyChannel(channel, { resolver = new dns.Resolver({ timeout: 2000, tries: 2 }), marker = deploymentMarker } = {}) {
  if (!channel.target) throw new Error('Save the hosting IP or CNAME target first.');
  const records = await resolver.resolveTxt(`_trulo-cms.${channel.domain}`);
  if (!records.some(parts => parts.join('') === `trulo-verification=${channel.verification_token}`)) {
    throw new Error('The TXT ownership verification record does not match.');
  }
  const [v4, v6] = await Promise.all([resolver.resolve4(channel.domain).catch(() => []), resolver.resolve6(channel.domain).catch(() => [])]);
  const addresses = [...v4.map(address => ({ address, family: 4 })), ...v6.map(address => ({ address, family: 6 }))];
  if (!addresses.length || addresses.some(item => !publicIp(item.address))) throw new Error('Domain must resolve only to public hosting addresses.');
  if (channel.record_type === 'CNAME') {
    const cnames = await resolver.resolveCname(channel.domain).catch(() => []);
    if (!cnames.some(name => name.toLowerCase().replace(/\.$/, '') === channel.target)) {
      throw new Error('CNAME does not match. Flattened or proxied DNS needs a provider-specific integration.');
    }
  } else if (!addresses.some(item => item.address === channel.target)) {
    throw new Error('The website DNS does not match the configured hosting IP.');
  }
  try {
    const markerMatches = await marker(channel, addresses[0]);
    return { status: markerMatches ? 'active' : 'dns_verified', verification_message: markerMatches ? 'DNS, ownership and HTTPS deployment verified.' : 'DNS verified. Upload the deployment marker to the hosting server.' };
  } catch (error) {
    return { status: 'dns_verified', verification_message: `DNS verified. HTTPS deployment pending: ${error.message}` };
  }
}
module.exports = { domainName, publicIp, normalizeChannel, dnsInstructions, verifyChannel };
