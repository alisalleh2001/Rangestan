import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Both plugins are required: Tailwind v4 only compiles through its Vite
// plugin — removing tailwindcss() leaves the app silently unstyled.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
