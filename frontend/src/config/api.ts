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

export const getApiUrl = (endpoint: string) => {
    // Determine whether to use the proxy URL
    const useProxy = !!API_CONFIG.PROXY_URL;
    const baseUrl = useProxy ? API_CONFIG.PROXY_URL : API_CONFIG.BASE_URL;

    // For proxy URLs, handle endpoints differently
    // If it's a full path like "/download/file.docx", just append it to proxy
    // If it's an API endpoint, we don't need to repeat it since proxy already has it
    const pathSuffix = useProxy && endpoint.startsWith('/') ?
        endpoint :
        (useProxy ? '' : endpoint);

    const url = `${baseUrl}${pathSuffix}`;
    console.log(`Generated API URL: ${url} (using proxy: ${useProxy})`);
    return url;
}; 