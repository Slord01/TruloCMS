/**
 * URL segment for /products/[id]/variants/[variantKey]
 * Encodes option_values join key (NUL-separated) as base64url.
 */

function utf8ToBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(segment) {
  let b64 = String(segment || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  b64 += pad;
  if (typeof atob !== "undefined") {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

export function encodeVariantPathKey(optionValues) {
  const raw = Array.isArray(optionValues) ? optionValues.join("\u0000") : "";
  return utf8ToBase64Url(raw);
}

/** @returns {string[] | null} */
export function decodeVariantPathKey(segment) {
  try {
    const raw = base64UrlToUtf8(segment);
    if (raw === "") return [];
    return raw.split("\u0000");
  } catch {
    return null;
  }
}

export function variantOptionKeyParts(v) {
  return Array.isArray(v?.option_values) ? v.option_values : null;
}

export function variantsOptionKeysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.join("\u0000") === b.join("\u0000");
}

export function findVariantIndexByOptionKey(variants, keyParts) {
  if (!Array.isArray(variants) || !Array.isArray(keyParts)) return -1;
  return variants.findIndex((v) => variantsOptionKeysEqual(v?.option_values, keyParts));
}
