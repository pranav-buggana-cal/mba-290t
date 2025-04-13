const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Serve static files if needed
// app.use(express.static('public'));

// Proxy configuration
const apiProxy = createProxyMiddleware({
    target: 'https://competitor-analysis-backend-342114956303.us-central1.run.app',
    changeOrigin: true,
    pathRewrite: {
        '^/api': '', // Remove /api prefix when forwarding
    },
    onProxyReq: (proxyReq, req, res) => {
        // Log the request
        console.log(`Proxying: ${req.method} ${req.url} -> ${proxyReq.path}`);
    },
    onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).send('Proxy error');
    }
});

// Apply the proxy middleware to all routes starting with /api
app.use('/api', apiProxy);

// Default route
app.get('/', (req, res) => {
    res.send('Proxy server is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
}); 