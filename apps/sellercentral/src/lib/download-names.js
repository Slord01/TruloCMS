import { lt } from "@/lib/locale-text";

export function returnSlipFilename(returnNumber, locale) {
  const n = returnNumber || "—";
  return lt(locale, `return-slip-R${n}.html`, `iade-fisi-R${n}.html`, `bon-retour-R${n}.html`, `albaran-devolucion-R${n}.html`, `bolla-reso-R${n}.html`, `Retoureschein-R${n}.html`);
}

export function productExcelTemplateFilename(locale) {
  return lt(locale, "trulo-products-template.xlsx", "trulo-urun-sablonu.xlsx", "trulo-produits-modele.xlsx", "trulo-productos-plantilla.xlsx", "trulo-prodotti-modello.xlsx", "trulo-produkte-vorlage.xlsx");
}

export function categoryExcelFilename(kind, locale) {
  const k = String(kind || "template").toLowerCase();
  if (k === "export") {
    return lt(
      locale,
      "trulo-categories-export.xlsx",
      "trulo-kategoriler-export.xlsx",
      "trulo-categories-export.xlsx",
      "trulo-categorias-export.xlsx",
      "trulo-categorie-export.xlsx",
      "trulo-kategorien-export.xlsx",
    );
  }
  return lt(
    locale,
    "trulo-categories-template.xlsx",
    "trulo-kategori-sablonu.xlsx",
    "trulo-categories-modele.xlsx",
    "trulo-categorias-plantilla.xlsx",
    "trulo-categorie-modello.xlsx",
    "trulo-kategorien-vorlage.xlsx",
  );
}

export function productCsvTemplateFilename(locale) {
  return lt(locale, "trulo-product-template.csv", "trulo-urun-sablonu.csv", "trulo-produits-modele.csv", "trulo-productos-plantilla.csv", "trulo-prodotti-modello.csv", "trulo-produkt-vorlage.csv");
}

export function productExportFilename(format, locale) {
  const ext = String(format || "xlsx").replace(/^\./, "");
  const base = lt(locale, "trulo-export", "trulo-disa-aktarma", "trulo-export", "trulo-exportacion", "trulo-esportazione", "trulo-export");
  return `${base}.${ext}`;
}

export function inventoryExportFilename(format, locale) {
  const ext = String(format || "xlsx").replace(/^\./, "");
  const base = lt(locale, "inventory-export", "envanter-disa-aktarma", "inventaire-export", "inventario-exportacion", "inventario-esportazione", "bestand-export");
  return `${base}.${ext}`;
}

export function ordersReportFilename(format, locale) {
  const ext = String(format || "csv").replace(/^\./, "");
  const base = lt(locale, "orders-report", "siparis-raporu", "rapport-commandes", "informe-pedidos", "report-ordini", "bestellungen-bericht");
  return `${base}.${ext}`;
}
