// vite.config.js
import { defineConfig } from "file:///F:/BRANDUX/misio/client/node_modules/vite/dist/node/index.js";
import { readFileSync } from "node:fs";
import react from "file:///F:/BRANDUX/misio/client/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///F:/BRANDUX/misio/client/node_modules/vite-plugin-pwa/dist/index.js";
var { version: APP_VERSION } = JSON.parse(readFileSync("./package.json", "utf8"));
var sslPlugin = null;
try {
  const { default: basicSsl } = await import("@vitejs/plugin-basic-ssl");
  sslPlugin = basicSsl();
} catch {
}
var vite_config_default = defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    sslPlugin,
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "Misio \u2014 Sorteos Cero P\xE9rdida",
        short_name: "Misio",
        description: "Sorteos donde nunca pierdes: si tu boleto no gana, su valor vuelve como saldo de canje.",
        theme_color: "#0e1015",
        background_color: "#0e1015",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        lang: "es-PE",
        categories: ["entertainment", "shopping"],
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        shortcuts: [
          { name: "Sorteos", short_name: "Sorteos", url: "/", icons: [{ src: "/pwa-192.png", sizes: "192x192" }] },
          { name: "Mi Misio", short_name: "Mi Misio", url: "/mi-cuenta", icons: [{ src: "/pwa-192.png", sizes: "192x192" }] },
          { name: "Tienda", short_name: "Tienda", url: "/tienda", icons: [{ src: "/pwa-192.png", sizes: "192x192" }] },
          { name: "Bingo Gratis", short_name: "Bingo", url: "/bingo", icons: [{ src: "/pwa-192.png", sizes: "192x192" }] }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"]
      }
    })
  ].filter(Boolean),
  server: {
    port: 5173,
    // host: true → escucha en 0.0.0.0 (toda la red local)
    host: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJGOlxcXFxCUkFORFVYXFxcXHphbGRvXFxcXGNsaWVudFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRjpcXFxcQlJBTkRVWFxcXFx6YWxkb1xcXFxjbGllbnRcXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Y6L0JSQU5EVVgvemFsZG8vY2xpZW50L3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tICdub2RlOmZzJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcblxuY29uc3QgeyB2ZXJzaW9uOiBBUFBfVkVSU0lPTiB9ID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoJy4vcGFja2FnZS5qc29uJywgJ3V0ZjgnKSk7XG5cbi8qKlxuICogSFRUUFMgRU4gUkVEIExPQ0FMOiBjb24gYmFzaWNTc2woKSBlbCBuYXZlZ2Fkb3IgZGVsIGNlbHVsYXIgYWN0aXZhIGVsXG4gKiBzZXJ2aWNlIHdvcmtlciB5IGVsIHByb21wdCBkZSBpbnN0YWxhY2lcdTAwRjNuIGRlIGxhIFBXQS4gU2luIEhUVFBTLCBsYSBQV0FcbiAqIG5vIHNlIGluc3RhbGEgZGVzZGUgb3RyYSBtXHUwMEUxcXVpbmEgZGUgbGEgcmVkLlxuICpcbiAqIEVsIHBsdWdpbiBnZW5lcmEgdW4gY2VydGlmaWNhZG8gYXV0b2Zpcm1hZG8gYWwgdnVlbG8gXHUyMDE0IG5vIGhheSBuYWRhIHF1ZVxuICogY29uZmlndXJhci4gRWwgY2VsdWxhciBtb3N0cmFyXHUwMEUxIFwiY29uZXhpXHUwMEYzbiBubyBzZWd1cmFcIiBsYSBwcmltZXJhIHZlejpcbiAqIGRhbGUgXCJBdmFuemFkbyBcdTIxOTIgQ29udGludWFyXCIgeSBsaXN0by5cbiAqL1xubGV0IHNzbFBsdWdpbiA9IG51bGw7XG50cnkge1xuICBjb25zdCB7IGRlZmF1bHQ6IGJhc2ljU3NsIH0gPSBhd2FpdCBpbXBvcnQoJ0B2aXRlanMvcGx1Z2luLWJhc2ljLXNzbCcpO1xuICBzc2xQbHVnaW4gPSBiYXNpY1NzbCgpO1xufSBjYXRjaCB7XG4gIC8vIFNpIG5vIGVzdFx1MDBFMSBpbnN0YWxhZG8sIFZpdGUgYXJyYW5jYSBlbiBIVFRQIG5vcm1hbFxufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBkZWZpbmU6IHsgX19BUFBfVkVSU0lPTl9fOiBKU09OLnN0cmluZ2lmeShBUFBfVkVSU0lPTikgfSxcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgc3NsUGx1Z2luLFxuICAgIFZpdGVQV0Eoe1xuICAgICAgcmVnaXN0ZXJUeXBlOiAnYXV0b1VwZGF0ZScsXG4gICAgICBpbmNsdWRlQXNzZXRzOiBbJ2Zhdmljb24uc3ZnJywgJ3B3YS0xOTIucG5nJywgJ3B3YS01MTIucG5nJ10sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiAnWmFsZG8gXHUyMDE0IFNvcnRlb3MgQ2VybyBQXHUwMEU5cmRpZGEnLFxuICAgICAgICBzaG9ydF9uYW1lOiAnWmFsZG8nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1NvcnRlb3MgZG9uZGUgbnVuY2EgcGllcmRlczogc2kgdHUgYm9sZXRvIG5vIGdhbmEsIHN1IHZhbG9yIHZ1ZWx2ZSBjb21vIHNhbGRvIGRlIGNhbmplLicsXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnIzBlMTAxNScsXG4gICAgICAgIGJhY2tncm91bmRfY29sb3I6ICcjMGUxMDE1JyxcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxuICAgICAgICBvcmllbnRhdGlvbjogJ3BvcnRyYWl0JyxcbiAgICAgICAgc3RhcnRfdXJsOiAnLycsXG4gICAgICAgIGxhbmc6ICdlcy1QRScsXG4gICAgICAgIGNhdGVnb3JpZXM6IFsnZW50ZXJ0YWlubWVudCcsICdzaG9wcGluZyddLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiAnL3B3YS0xOTIucG5nJywgc2l6ZXM6ICcxOTJ4MTkyJywgdHlwZTogJ2ltYWdlL3BuZycgfSxcbiAgICAgICAgICB7IHNyYzogJy9wd2EtNTEyLnBuZycsIHNpemVzOiAnNTEyeDUxMicsIHR5cGU6ICdpbWFnZS9wbmcnIH0sXG4gICAgICAgICAgeyBzcmM6ICcvcHdhLTUxMi5wbmcnLCBzaXplczogJzUxMng1MTInLCB0eXBlOiAnaW1hZ2UvcG5nJywgcHVycG9zZTogJ21hc2thYmxlJyB9LFxuICAgICAgICBdLFxuICAgICAgICBzaG9ydGN1dHM6IFtcbiAgICAgICAgICB7IG5hbWU6ICdTb3J0ZW9zJywgc2hvcnRfbmFtZTogJ1NvcnRlb3MnLCB1cmw6ICcvJywgaWNvbnM6IFt7IHNyYzogJy9wd2EtMTkyLnBuZycsIHNpemVzOiAnMTkyeDE5MicgfV0gfSxcbiAgICAgICAgICB7IG5hbWU6ICdNaSBaYWxkbycsIHNob3J0X25hbWU6ICdNaSBaYWxkbycsIHVybDogJy9taS1jdWVudGEnLCBpY29uczogW3sgc3JjOiAnL3B3YS0xOTIucG5nJywgc2l6ZXM6ICcxOTJ4MTkyJyB9XSB9LFxuICAgICAgICAgIHsgbmFtZTogJ1RpZW5kYScsIHNob3J0X25hbWU6ICdUaWVuZGEnLCB1cmw6ICcvdGllbmRhJywgaWNvbnM6IFt7IHNyYzogJy9wd2EtMTkyLnBuZycsIHNpemVzOiAnMTkyeDE5MicgfV0gfSxcbiAgICAgICAgICB7IG5hbWU6ICdCaW5nbyBHcmF0aXMnLCBzaG9ydF9uYW1lOiAnQmluZ28nLCB1cmw6ICcvYmluZ28nLCBpY29uczogW3sgc3JjOiAnL3B3YS0xOTIucG5nJywgc2l6ZXM6ICcxOTJ4MTkyJyB9XSB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIHdvcmtib3g6IHtcbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbJyoqLyoue2pzLGNzcyxodG1sLHN2Zyxwbmcsd29mZjJ9J10sXG4gICAgICB9LFxuICAgIH0pLFxuICBdLmZpbHRlcihCb29sZWFuKSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3MyxcbiAgICAvLyBob3N0OiB0cnVlIFx1MjE5MiBlc2N1Y2hhIGVuIDAuMC4wLjAgKHRvZGEgbGEgcmVkIGxvY2FsKVxuICAgIGhvc3Q6IHRydWUsXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1AsU0FBUyxvQkFBb0I7QUFDNVIsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUV4QixJQUFNLEVBQUUsU0FBUyxZQUFZLElBQUksS0FBSyxNQUFNLGFBQWEsa0JBQWtCLE1BQU0sQ0FBQztBQVdsRixJQUFJLFlBQVk7QUFDaEIsSUFBSTtBQUNGLFFBQU0sRUFBRSxTQUFTLFNBQVMsSUFBSSxNQUFNLE9BQU8sMEJBQTBCO0FBQ3JFLGNBQVksU0FBUztBQUN2QixRQUFRO0FBRVI7QUFFQSxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixRQUFRLEVBQUUsaUJBQWlCLEtBQUssVUFBVSxXQUFXLEVBQUU7QUFBQSxFQUN2RCxTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTjtBQUFBLElBQ0EsUUFBUTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsZUFBZSxDQUFDLGVBQWUsZUFBZSxhQUFhO0FBQUEsTUFDM0QsVUFBVTtBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osYUFBYTtBQUFBLFFBQ2IsYUFBYTtBQUFBLFFBQ2Isa0JBQWtCO0FBQUEsUUFDbEIsU0FBUztBQUFBLFFBQ1QsYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsTUFBTTtBQUFBLFFBQ04sWUFBWSxDQUFDLGlCQUFpQixVQUFVO0FBQUEsUUFDeEMsT0FBTztBQUFBLFVBQ0wsRUFBRSxLQUFLLGdCQUFnQixPQUFPLFdBQVcsTUFBTSxZQUFZO0FBQUEsVUFDM0QsRUFBRSxLQUFLLGdCQUFnQixPQUFPLFdBQVcsTUFBTSxZQUFZO0FBQUEsVUFDM0QsRUFBRSxLQUFLLGdCQUFnQixPQUFPLFdBQVcsTUFBTSxhQUFhLFNBQVMsV0FBVztBQUFBLFFBQ2xGO0FBQUEsUUFDQSxXQUFXO0FBQUEsVUFDVCxFQUFFLE1BQU0sV0FBVyxZQUFZLFdBQVcsS0FBSyxLQUFLLE9BQU8sQ0FBQyxFQUFFLEtBQUssZ0JBQWdCLE9BQU8sVUFBVSxDQUFDLEVBQUU7QUFBQSxVQUN2RyxFQUFFLE1BQU0sWUFBWSxZQUFZLFlBQVksS0FBSyxjQUFjLE9BQU8sQ0FBQyxFQUFFLEtBQUssZ0JBQWdCLE9BQU8sVUFBVSxDQUFDLEVBQUU7QUFBQSxVQUNsSCxFQUFFLE1BQU0sVUFBVSxZQUFZLFVBQVUsS0FBSyxXQUFXLE9BQU8sQ0FBQyxFQUFFLEtBQUssZ0JBQWdCLE9BQU8sVUFBVSxDQUFDLEVBQUU7QUFBQSxVQUMzRyxFQUFFLE1BQU0sZ0JBQWdCLFlBQVksU0FBUyxLQUFLLFVBQVUsT0FBTyxDQUFDLEVBQUUsS0FBSyxnQkFBZ0IsT0FBTyxVQUFVLENBQUMsRUFBRTtBQUFBLFFBQ2pIO0FBQUEsTUFDRjtBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1AsY0FBYyxDQUFDLGtDQUFrQztBQUFBLE1BQ25EO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSCxFQUFFLE9BQU8sT0FBTztBQUFBLEVBQ2hCLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQTtBQUFBLElBRU4sTUFBTTtBQUFBLEVBQ1I7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
