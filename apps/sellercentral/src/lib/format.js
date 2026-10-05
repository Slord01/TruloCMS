/**
 * Format number with comma as decimal separator (e.g. 9,95)
 */
export function formatDecimal(num) {
  if (num == null || Number.isNaN(Number(num))) return "0,00";
  const n = Number(num);
  const fixed = n.toFixed(2);
  return fixed.replace(".", ",");
}
