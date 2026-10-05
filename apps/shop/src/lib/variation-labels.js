/**
 * Variation option `value` = canonical key (matches variant.option_values).
 * `labels[locale]` = storefront label; fallback to `value`.
 */

export function optionCanonicalValue(opt) {
  if (opt && typeof opt === "object") return String(opt.value ?? "").trim();
  return String(opt ?? "").trim();
}

export function optionDisplayLabel(opt, locale) {
  const loc = String(locale || "de").toLowerCase();
  if (opt && typeof opt === "object") {
    const labels = opt.labels && typeof opt.labels === "object" ? opt.labels : {};
    if (Object.prototype.hasOwnProperty.call(labels, loc)) {
      const s = labels[loc];
      if (s != null && String(s).trim() !== "") return String(s).trim();
    }
    return String(opt.value ?? "").trim();
  }
  return String(opt ?? "").trim();
}

export function variationGroupDisplayName(group, groupIndex, metadata, locale) {
  const loc = String(locale || "de").toLowerCase();
  if (loc === "de") return String(group?.name || "").trim();
  const tr = metadata?.translations?.[loc];
  const arr = tr?.variation_groups;
  if (Array.isArray(arr) && arr[groupIndex]?.name != null && String(arr[groupIndex].name).trim() !== "") {
    return String(arr[groupIndex].name).trim();
  }
  return String(group?.name || "").trim();
}
