import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Resolve entry paths from this config file, never from process.cwd():
// tauri build runs its beforeBuildCommand from app/tauri/, so cwd-relative
// inputs resolved to app/tauri/*.html and failed the build.
const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url))

// Pet-only public executable build. No game base; only the pet, setup and
// import pages are entries. Static legal/AI files are repository/Tauri files.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        pet: resolve(PROJECT_ROOT, 'pet.html'),
        setup: resolve(PROJECT_ROOT, 'setup.html'),
        'chat-import': resolve(PROJECT_ROOT, 'chat-import.html'),
      },
    },
  },
})
