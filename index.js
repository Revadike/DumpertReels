const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 6969;
const HTML_PATH = process.env.HTML_PATH || path.join(__dirname, 'index.html');

// Helper function to proxy any HTTPS request
function proxyRequest(url, res) {
    https.get(url, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error('Proxy error:', err);
        res.writeHead(500);
        res.end('Proxy error');
    });
}

// Helper function to fetch data from Dumpert API
function fetchFromDumpert(page = 0, nsfw = false) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {}
        };

        if (nsfw) {
            options.headers['X-Dumpert-NSFW'] = '1';
        }

        https.get(`https://api-live.dumpert.nl/mobile_api/json/video/toppers/${page}/`, options, (resp) => {
            let data = '';
            resp.on('data', (chunk) => data += chunk);
            resp.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname;
    const nsfw = urlObj.searchParams.get('nsfw') === '1';

    if (pathname === '/') {
        fs.readFile(HTML_PATH, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    }
    else if (pathname.startsWith('/api/videos/')) {
        try {
            const page = parseInt(pathname.split('/').pop()) || 0;
            const data = await fetchFromDumpert(page, nsfw);
            const jsonData = JSON.parse(data);
            jsonData.items.forEach(item => {
                item.media.forEach(media => {
                    media.variants.forEach(variant => {
                        if (variant.uri) {
                            const originalUrl = new URL(variant.uri);
                            variant.uri = `/proxy${originalUrl.pathname}${originalUrl.search || ''}`;
                        }
                    });
                });
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(jsonData));
        } catch (error) {
            console.error('Error fetching from Dumpert API:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to fetch videos' }));
        }
    }
    else if (pathname.startsWith('/proxy/')) {
        const originalPath = pathname.replace('/proxy', '');
        const targetUrl = `https://media.dumpert.nl${originalPath}`;
        proxyRequest(targetUrl, res);
    }
    else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});