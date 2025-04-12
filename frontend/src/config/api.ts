export const API_CONFIG = {
    BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    ENDPOINTS: {
        AUTH: '/token',
        UPLOAD: '/upload-documents',
        ANALYZE: '/analyze-competitors'
    }
} as const;

export const getApiUrl = (endpoint: string) => {
    return `${API_CONFIG.BASE_URL}${endpoint}`;
}; 