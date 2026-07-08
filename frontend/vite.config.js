import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {         // added to make the containor listen to any changes in files, for local testing
    host: true,         
    port: 3000,         
    watch: {
      usePolling: true
    }
  }
})