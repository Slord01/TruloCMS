"use client";

import React from "react";

/**
 * Product description editor. Uses a multiline textarea; supports HTML (paste or type).
 * react-quill was removed due to React 19 / Next.js compatibility issues.
 * Store still renders description as sanitized HTML.
 */
export default function ProductDescriptionEditor({ value = "", onChange, placeholder = "Product description…" }) {
  return (
    <div className="product-description-editor">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={10}
        style={{
          width: "100%",
          minHeight: 220,
          padding: 12,
          border: "1px solid var(--p-color-border, #ccc)",
          borderRadius: 8,
          fontSize: 14,
          fontFamily: "inherit",
          resize: "vertical",
        }}
      />
    </div>
  );
}
