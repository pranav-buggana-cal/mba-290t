const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;
const TARGET = process.env.TARGET || 'https://competitor-analysis-backend-342114956303.us-central1.run.app';

// Configure body parser limits for larger files (200MB)
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Enable CORS for all routes
app.use(cors());

// Log requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Direct implementation of token endpoint
app.post('/api/token', express.urlencoded({ extended: true }), async (req, res) => {
    console.log('Token endpoint called directly');

    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Missing credentials' });
        }

        console.log(`Attempting to get token for user: ${username}`);

        // Make a direct request to the backend
        const response = await axios({
            method: 'post',
            url: `${TARGET}/token`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
            timeout: 5000 // 5 second timeout
        });

        console.log('Token request successful');
        return res.status(200).json(response.data);
    } catch (error) {
        console.error('Token request error:', error.message);
        return res.status(500).json({
            error: 'Token request failed',
            message: error.message
        });
    }
});

// Special handling for file uploads
const uploadProxy = createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '', // Remove /api prefix when forwarding
    },
    // Set much longer timeout for file uploads
    proxyTimeout: 120000, // 2 minutes
    timeout: 120000, // 2 minutes
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Proxying file upload: ${req.method} ${req.url} → ${TARGET}${proxyReq.path}`);

        // Preserve Authorization header
        if (req.headers.authorization) {
            console.log('Adding authorization header to upload request');
            proxyReq.setHeader('Authorization', req.headers.authorization);
        }

        // For multipart/form-data, we do not set the content-type manually
        // The browser will set it with the proper boundary
        console.log('Content-Type:', req.headers['content-type']);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`File upload response: ${proxyRes.statusCode}`);
    },
    onError: (err, req, res) => {
        console.error('File upload proxy error:', err);
        res.status(500).json({
            error: 'File Upload Error',
            message: err.message
        });
    }
});

// Create proxy middleware for other routes
const apiProxy = createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '', // Remove /api prefix when forwarding
    },
    // Set reasonable timeout for most API requests
    proxyTimeout: 30000, // 30 seconds
    timeout: 30000, // 30 seconds
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Proxying ${req.method} ${req.url} → ${TARGET}${proxyReq.path}`);

        // Preserve Authorization header if present
        if (req.headers.authorization) {
            proxyReq.setHeader('Authorization', req.headers.authorization);
        }
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).json({
            error: 'Proxy Error',
            message: err.message
        });
    }
});

// Use the upload proxy specifically for the upload endpoint
app.use('/api/upload-documents', uploadProxy);

// Use the regular proxy for all other API routes
app.use('/api', apiProxy);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('Proxy server is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
    console.log(`Proxying requests to ${TARGET}`);
    console.log(`Maximum file upload size: 200MB`);
}); 