import type { MetadataRoute } from "next";

/** Web app manifest: lets Android (and desktop Chrome/Edge) install KindChat to the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KindChat",
    short_name: "KindChat",
    description: "A quieter place for two. Private messaging for couples.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f4ee",
    theme_color: "#f7f4ee",
    categories: ["social", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
