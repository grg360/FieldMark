import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: true,   // bind to all interfaces so other devices on your Wi-Fi can reach it
    port: 5173,   // matches what you've been using
    hmr: { host: '192.168.1.84' },   // HMR websocket connects to the PC, not the phone's localhost
  },
});