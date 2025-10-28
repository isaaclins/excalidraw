import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  const isTauriDebug = process.env.TAURI_DEBUG === 'true'
  const buildTarget =
    process.env.TAURI_PLATFORM === 'windows' ? 'chrome110' : 'safari15'
  const minifyValue = isTauriDebug ? false : ('esbuild' as const)

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
      target: buildTarget,
      minify: minifyValue,
      sourcemap: isTauriDebug,
    },
  }
})
