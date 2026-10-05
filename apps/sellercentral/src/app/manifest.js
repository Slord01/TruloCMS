export default function manifest() {
  return {
    name: "Trulo Seller Central",
    short_name: "Seller Central",
    description: "Manage your store on Trulo",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0F766E",
    icons: [
      { src: "/api/brand-favicon?app=sellercentral", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/brand-favicon?app=sellercentral", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/trulo-icon.svg", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/trulo-icon.svg", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
