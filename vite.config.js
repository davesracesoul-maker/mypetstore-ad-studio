import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local dev has no Netlify functions — proxy API calls to the live site
      '/api': 'https://mypetstore-ad-studio.netlify.app',
    },
  },
})
