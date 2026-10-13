import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // En développement, /api part vers le backend FastAPI local (uvicorn app.main:app).
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
