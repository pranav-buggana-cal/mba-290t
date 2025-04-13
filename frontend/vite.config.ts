import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd())

  // Check if the environment variable is available or use a default
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'
  console.log('Building with API URL:', apiUrl)

  return {
    plugins: [react()],
    define: {
      // Explicitly define the environment variable
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
    },
    server: {
      // Force the server to use port 5173, which is allowed in the Cloud Run CORS configuration
      port: 5173,
      strictPort: true, // Fail if port is already in use
      host: 'localhost',
      proxy: {
        // Proxy all API requests to backend during development
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          secure: true,
          configure: (proxy, options) => {
            // Additional proxy configuration if needed
            console.log('Proxy configured with target:', options.target);
          }
        }
      }
    }
  }
})
