import { defineConfig } from 'vite';

// Local dev only: proxy both Anvil nodes through the page's own origin so phones on LAN
// or through an HTTPS tunnel (camera needs HTTPS) can reach the chains via one port.
export default defineConfig({
  server: {
    allowedHosts: true,
    proxy: {
      '/rpc/game': { target: 'http://127.0.0.1:8545', changeOrigin: true, rewrite: () => '/' },
      '/rpc/cchain': { target: 'http://127.0.0.1:9545', changeOrigin: true, rewrite: () => '/' }
    }
  },
  // Relative asset paths, so the same build works at a domain root or under GitHub Pages' /GameOnL1-3Ks/.
  base: './',
  build: { chunkSizeWarningLimit: 2000 }
});
