const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3001;
const TARGET = 'https://competitor-analysis-backend-342114956303.us-central1.run.app';

// Enable CORS for all routes
app.use(cors());

// Log requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    // Debug auth headers
    if (req.headers.authorization) {
        console.log('Authorization header:', req.headers.authorization.substring(0, 15) + '...');
    } else {
        console.log('No Authorization header present');
    }

    next();
});

// Create proxy middleware with better error handling
const apiProxy = createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '', // Remove /api prefix when forwarding
    },
    onProxyReq: (proxyReq, req, res) => {
        // Log proxy requests with detailed info
        console.log(`Proxying ${req.method} ${req.url} → ${TARGET}${proxyReq.path}`);

        // Debug headers being sent to the backend
        if (req.headers.authorization) {
            console.log('Forwarding Authorization header to backend');
            // Make sure authorization header is preserved
            proxyReq.setHeader('Authorization', req.headers.authorization);
        }

        // For multipart/form-data, we need to let the browser set the content-type with boundary
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            console.log('Handling multipart/form-data request');
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        // Log responses with details
        console.log(`Received ${proxyRes.statusCode} from ${TARGET} for ${req.method} ${req.url}`);

        // Debug response headers
        console.log('Response headers:', JSON.stringify(proxyRes.headers, null, 2));

        // Add CORS headers to the response if not present
        if (!proxyRes.headers['access-control-allow-origin']) {
            proxyRes.headers['access-control-allow-origin'] = '*';
        }

        // Handle authentication errors
        if (proxyRes.statusCode === 401) {
            console.log('Authentication failed - 401 Unauthorized');
        }
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).send(`Proxy Error: ${err.message}`);
    }
});

// Special handling for OPTIONS preflight requests
app.options('*', cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Use the proxy for all /api routes
app.use('/api', apiProxy);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('Proxy server is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
    console.log(`Proxying requests to ${TARGET}`);
    console.log(`Use http://localhost:${PORT}/api/[endpoint] to access the backend`);
}); 