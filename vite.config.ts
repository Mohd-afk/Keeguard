/**
 * Vite Configuration File
 * Configures React plugin, Tailwind CSS v4, base relative paths, and '@' import path alias resolution.
 */

import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // ── Build-time constants ─────────────────────────────────────────────
  // __LOG_LEVEL__ is replaced at compile time — no runtime cost.
  // Production: 'warn' → hides debug/info logs (UIDs, emails, crypto internals)
  //             from adb logcat and browser DevTools in the wild.
  // Development: 'debug' → full verbosity for local debugging.
  define: {
    __LOG_LEVEL__: JSON.stringify(mode === 'production' ? 'warn' : 'debug'),
  },

  build: {
    // ─── OTA Stability: Disable content hashing ──────────────────────
    // Vite defaults to hashed filenames (e.g. index-A3bC4d.js).
    // Capgo's local webserver fails to resolve these unpredictable paths,
    // causing a silent 404 that kills the OTA bundle before React mounts.
    // Stable, predictable filenames make Capgo's file serving bulletproof.
    rollupOptions: {
      output: {
        // Force stable, non-hashed filenames for all entry and chunk files
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
}))
