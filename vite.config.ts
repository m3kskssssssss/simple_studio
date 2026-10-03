import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // относительные пути — чтобы сборка открывалась из файла (в .exe)
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
