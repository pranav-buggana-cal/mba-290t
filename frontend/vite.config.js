import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    preview: {
        port: process.env.PORT || 8080,
        host: '0.0.0.0',
        allowedHosts: [
            'competitor-analysis-frontend-342114956303.us-central1.run.app',
            'localhost'
        ]
    }
}) 