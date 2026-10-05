export default function manifest() {
  return {
    name: "Trulo",
    short_name: "Trulo",
    description: "Discover amazing products from independent sellers",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1b8880",
    icons: [
      { src: "/api/brand-favicon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/brand-favicon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/trulo-icon.svg", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/trulo-icon.svg", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
