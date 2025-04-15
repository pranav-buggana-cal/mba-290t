const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const TARGET = process.env.TARGET || 'https://competitor-analysis-backend-342114956303.us-central1.run.app';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '300000', 10); // 5 minutes in milliseconds

// Configure body parser limits for larger files (200MB)
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Enable CORS for all routes with proper configuration
app.use(cors({
    origin: '*', // Allow all origins in dev; in prod this should be more restrictive
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400 // 24 hours
}));

// Log requests
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    if (req.headers.authorization) {
        // Log that we have authorization, but not the token itself
        console.log(`[${timestamp}] Authorization header present`);
    }
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
            timeout: 10000 // 10 second timeout
        });

        console.log('Token request successful');

        // Ensure CORS headers are set
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true'
        });

        return res.status(200).json(response.data);
    } catch (error) {
        console.error('Token request error:', error.message);

        let status = 500;
        let errorMessage = 'Token request failed';

        // Handle specific error types
        if (error.response) {
            status = error.response.status;
            errorMessage = error.response.data?.detail || 'Authentication failed';
            console.error('Backend response:', status, JSON.stringify(error.response.data || {}));
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'Request timeout - backend server may be overloaded';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Could not connect to backend server';
        }

        return res.status(status).json({
            error: errorMessage,
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
    proxyTimeout: 600000, // 10 minutes for large files
    timeout: 600000, // 10 minutes
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Proxying file upload: ${req.method} ${req.url} → ${TARGET}${proxyReq.path}`);
        console.log(`Upload content type: ${req.headers['content-type']}`);

        // Log content length if available
        if (req.headers['content-length']) {
            console.log(`Upload content length: ${req.headers['content-length']} bytes`);
        }

        // Preserve Authorization header
        if (req.headers.authorization) {
            console.log('Adding authorization header to upload request');
            proxyReq.setHeader('Authorization', req.headers.authorization);
        } else {
            console.warn('No authorization header in upload request - authentication may fail');
        }

        // For multipart/form-data, we do not need to modify the body
        // The http-proxy-middleware handles this automatically
    },
    onProxyRes: (proxyRes, req, res) => {
        const statusCode = proxyRes.statusCode;
        console.log(`File upload response: ${statusCode}`);

        // Ensure CORS headers are set in the response
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With';
        proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';

        // Log error responses
        if (statusCode >= 400) {
            console.error(`Upload error: ${statusCode}`);
            // We'll collect the response body to log it
            let responseBody = '';
            proxyRes.on('data', (chunk) => {
                responseBody += chunk;
            });
            proxyRes.on('end', () => {
                try {
                    console.error('Error response:', responseBody);
                } catch (e) {
                    console.error('Could not parse error response');
                }
            });
        }
    },
    onError: (err, req, res) => {
        console.error('File upload proxy error:', err);

        // Add more detailed error logging
        if (err.code === 'ECONNRESET') {
            console.error('Connection reset by the server - may indicate a timeout or server crash');
        } else if (err.code === 'ECONNREFUSED') {
            console.error('Connection refused - backend server may be down');
        } else if (err.code === 'ETIMEDOUT') {
            console.error('Connection timed out - backend server may be overloaded');
        }

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        res.setHeader('Access-Control-Allow-Credentials', 'true');

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'File Upload Error',
            message: err.message
        }));
    }
});

// Create proxy middleware for other routes
const apiProxy = createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '', // Remove /api prefix when forwarding
    },
    // Set much longer timeout for most API requests, especially for analysis
    proxyTimeout: 300000, // 5 minutes (was 30 seconds)
    timeout: 300000, // 5 minutes (was 30 seconds)
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Proxying ${req.method} ${req.url} → ${TARGET}${proxyReq.path}`);

        // Preserve Authorization header if present
        if (req.headers.authorization) {
            proxyReq.setHeader('Authorization', req.headers.authorization);
        } else if (req.method !== 'OPTIONS' && !req.url.includes('/token')) {
            console.warn(`No authorization header in ${req.method} ${req.url} - authentication may fail`);
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        const statusCode = proxyRes.statusCode;
        console.log(`Proxy response for ${req.method} ${req.url}: ${statusCode}`);

        // Set longer timeout for analysis requests
        if (req.url.includes('/analyze-competitors')) {
            req.socket.setTimeout(300000); // 5 minutes
        }

        // Ensure CORS headers are set in the response
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With';
        proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';

        // Handle authentication errors specially
        if (statusCode === 401) {
            console.error('Authentication failed - invalid or expired token');
        } else if (statusCode >= 400) {
            console.error(`Request error: ${statusCode}`);
        }
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);

        // Ensure CORS headers are set even for errors
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
            'Access-Control-Allow-Credentials': 'true'
        });

        res.status(500).json({
            error: 'Proxy Error',
            message: err.message
        });
    }
});

// Add a special handler for analyze-competitors endpoint
app.post('/api/analyze-competitors', async (req, res) => {
    console.log('Analysis endpoint called directly through proxy');

    try {
        // Extract authorization from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid authorization header'
            });
        }

        // Get query parameter
        const query = req.query.query;
        if (!query) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Missing query parameter'
            });
        }

        console.log(`Forwarding analysis request with query: ${query}`);

        // Set up request options
        const options = {
            method: 'POST',
            url: `${TARGET}/analyze-competitors`,
            params: { query },
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            // Very long timeout for analysis
            timeout: 600000, // 10 minutes
            responseType: 'json'
        };

        // Make the request to the backend
        const response = await axios(options);

        // Add CORS headers
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true'
        });

        // Send the response data directly
        return res.status(response.status).json(response.data);
    } catch (error) {
        console.error('Analysis error:', error.message);

        // Ensure CORS headers are set even for errors
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true'
        });

        // Handle different error scenarios
        if (error.response) {
            // The backend returned an error response
            const status = error.response.status;
            const errorMessage = error.response.data?.detail || 'Backend error';
            return res.status(status).json({
                error: 'Analysis Failed',
                message: errorMessage,
                status
            });
        } else if (error.code === 'ECONNABORTED') {
            // Request timed out
            return res.status(504).json({
                error: 'Gateway Timeout',
                message: 'Analysis took too long to complete. Try a simpler query or try again later.'
            });
        } else if (error.code === 'ECONNRESET') {
            // Connection reset
            return res.status(502).json({
                error: 'Bad Gateway',
                message: 'Connection to backend was reset. The analysis might be too complex or the server is overloaded.'
            });
        } else {
            // Unknown error
            return res.status(500).json({
                error: 'Analysis Error',
                message: error.message
            });
        }
    }
});

// Use the upload proxy specifically for the upload endpoint
// app.use('/api/upload-documents', function (req, res, next) {
//     // Set a longer timeout for upload requests
//     req.setTimeout(REQUEST_TIMEOUT);
//     res.setTimeout(REQUEST_TIMEOUT);
//     next();
// }, uploadProxy);

// Use the regular proxy for all other API routes
app.use('/api', apiProxy);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send({
        status: 'ok',
        message: 'Proxy server is running',
        target: TARGET
    });
});

// Add error handling for timeouts
app.use(function (err, req, res, next) {
    if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        console.error('Request timed out:', req.url);
        return res.status(504).json({ error: 'Request timed out. The file may be too large or the server is busy.' });
    }
    next(err);
});

// Add custom file upload handling
app.post('/api/upload-documents', async (req, res) => {
    console.log('Custom file upload handler called');
    const timeoutValue = parseInt(REQUEST_TIMEOUT, 10);
    console.log(`Setting request timeout to ${timeoutValue}ms`);
    req.setTimeout(timeoutValue);
    res.setTimeout(timeoutValue);

    try {
        // Ensure proper CORS headers
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true'
        });

        // Check authentication
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            console.error('Missing authorization header');
            return res.status(401).json({ error: 'Missing authorization header' });
        }

        // Configure formidable to handle the multipart form
        const form = formidable({
            maxFileSize: 200 * 1024 * 1024, // 200MB max size
            multiples: true,
            uploadDir: path.join(__dirname, 'temp'),
            keepExtensions: true,
            allowEmptyFiles: false,
        });

        // Create temp directory if it doesn't exist
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        console.log('Parsing form data...');

        // Parse the form (formidable v3.x API)
        try {
            const [fields, files] = await form.parse(req);

            console.log('Form parsed successfully');
            console.log('Fields:', fields);
            console.log('Files received:', files ? (files.files ? files.files.length : 0) : 0);

            // Create FormData to send to backend
            const FormData = require('form-data');
            const formData = new FormData();

            // Handle file_type parameter if it exists
            const fileType = fields.file_type ? fields.file_type[0] : 'competitor';
            formData.append('file_type', fileType);

            // Add each file to form data (formidable v3.x returns arrays for fields)
            if (files && files.files) {
                const fileArray = files.files;

                for (const file of fileArray) {
                    console.log(`Processing file: ${file.originalFilename}, size: ${file.size} bytes, path: ${file.filepath}`);

                    try {
                        // Read file from temp storage
                        const fileContent = fs.readFileSync(file.filepath);

                        // Add to form data
                        formData.append('files', fileContent, {
                            filename: file.originalFilename,
                            contentType: file.mimetype
                        });
                    } catch (fileError) {
                        console.error(`Error reading file ${file.originalFilename}:`, fileError);
                    }
                }

                console.log('Files added to form data, sending to backend...');

                try {
                    // Send to backend
                    console.log(`Forwarding ${fileArray.length} files to backend: ${TARGET}/upload-documents`);
                    const response = await axios.post(`${TARGET}/upload-documents`, formData, {
                        headers: {
                            ...formData.getHeaders(),
                            'Authorization': authHeader
                        },
                        timeout: parseInt(REQUEST_TIMEOUT, 10)
                    });

                    // Clean up temp files
                    for (const file of fileArray) {
                        try {
                            if (fs.existsSync(file.filepath)) {
                                fs.unlinkSync(file.filepath);
                                console.log(`Cleaned up temp file: ${file.filepath}`);
                            }
                        } catch (cleanupError) {
                            console.error(`Error cleaning up temp file ${file.filepath}:`, cleanupError);
                        }
                    }

                    // Return backend response
                    console.log('Upload successful, returning response');
                    return res.status(response.status).json(response.data);
                } catch (uploadError) {
                    console.error('Error forwarding to backend:', uploadError.message);

                    // Clean up temp files
                    for (const file of fileArray) {
                        try {
                            if (fs.existsSync(file.filepath)) {
                                fs.unlinkSync(file.filepath);
                            }
                        } catch (cleanupError) {
                            console.error(`Error cleaning up temp file ${file.filepath}:`, cleanupError);
                        }
                    }

                    // Handle different error types
                    if (uploadError.response) {
                        return res.status(uploadError.response.status).json(uploadError.response.data);
                    } else {
                        return res.status(500).json({
                            error: 'Upload failed',
                            message: uploadError.message
                        });
                    }
                }
            } else {
                console.error('No files found in upload');
                return res.status(400).json({ error: 'No files provided' });
            }
        } catch (parseError) {
            console.error('Form parsing error:', parseError);
            return res.status(500).json({
                error: 'Failed to parse form data',
                message: parseError.message
            });
        }
    } catch (error) {
        console.error('Unexpected error in upload handler:', error);
        return res.status(500).json({
            error: 'Unexpected error',
            message: error.message
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
    console.log(`Proxying requests to ${TARGET}`);
    console.log(`Maximum file upload size: 200MB`);
}); 