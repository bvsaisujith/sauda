import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3000';
const WEB_PORT = Number(process.env.WEB_PORT ?? 5174);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: WEB_PORT,
    proxy: {
      '/auth': API_TARGET,
      '/health': API_TARGET,
      '/voice': API_TARGET,
    },
  },
});
