import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.PAGES ? "/saleslab/" : "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "SalesLab: AI sales call practice",
        short_name: "SalesLab",
        description: "Practice sales calls out loud with AI buyers and get graded by an AI coach.",
        theme_color: "#10251f",
        background_color: "#10251f",
        display: "standalone",
        orientation: "any",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell works offline (history, reports). The 2 MB voice worker is cached only once used.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["**/tts.worker-*.js"],
        runtimeCaching: [
          { urlPattern: /tts\.worker-.*\.js$|\.wasm$/, handler: "CacheFirst", options: { cacheName: "voice-engine", expiration: { maxEntries: 6 } } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: "StaleWhileRevalidate", options: { cacheName: "fonts" } },
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
  test: { environment: "happy-dom", setupFiles: ["tests/setup.ts"], include: ["tests/unit/**/*.test.ts"] },
});
