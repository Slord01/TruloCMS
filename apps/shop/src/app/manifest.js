export default function manifest() {
  return {
    name: "Trulo",
    short_name: "Trulo",
    description: "Discover amazing products from independent sellers",
    start_url: "/shop/",
    scope: "/shop/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1b8880",
    icons: [
      { src: "/shop/api/brand-favicon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/shop/api/brand-favicon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/shop/trulo-icon.svg", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/shop/trulo-icon.svg", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
