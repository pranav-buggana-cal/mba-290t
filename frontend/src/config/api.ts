// Force proxy flag set in vite.config.ts
const FORCE_PROXY = import.meta.env.FORCE_PROXY === 'true';

export const API_CONFIG = {
    BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    PROXY_URL: import.meta.env.VITE_API_PROXY_URL || '',
    ENDPOINTS: {
        AUTH: '/token',
        UPLOAD: '/upload-documents',
        ANALYZE: '/analyze-competitors'
    }
} as const;

// Log the API URL for debugging
console.log('API Base URL:', API_CONFIG.BASE_URL);
console.log('Environment VITE_API_URL:', import.meta.env.VITE_API_URL);
console.log('Proxy URL:', API_CONFIG.PROXY_URL);
console.log('Force Proxy:', FORCE_PROXY);

// Determine if we're in production by checking the hostname
const isProd = typeof window !== 'undefined' &&
    window.location.hostname.includes('run.app');

export const getApiUrl = (endpoint: string) => {
    // Always use proxy in production or if forced
    const useProxy = FORCE_PROXY || isProd || !!API_CONFIG.PROXY_URL;

    // For development without a proxy
    if (!useProxy) {
        const url = `${API_CONFIG.BASE_URL}${endpoint}`;
        console.log(`Generated API URL: ${url} (using direct connection)`);
        return url;
    }

    // For production or when proxy is available
    // If no proxy URL is explicitly set, use the origin path for same-origin proxy
    const proxyUrl = API_CONFIG.PROXY_URL || `${window.location.origin}/api`;

    // For proxy URLs, handle endpoints differently
    // If it's a full path like "/download/file.docx", just append it
    // If it's an API endpoint, modify as needed based on proxy configuration
    const pathSuffix = endpoint.startsWith('/') ? endpoint : '';

    const url = `${proxyUrl}${pathSuffix}`;
    console.log(`Generated API URL: ${url} (using proxy)`);
    return url;
}; 