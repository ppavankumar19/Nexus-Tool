require('dotenv').config();

const express = require('express');
const dns = require('dns').promises;
const path = require('path');
const cors = require('cors');
const net = require('net');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// =============================================================================
// 1. MIDDLEWARE
// =============================================================================

// Rate Limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait before trying again.' }
});

const lookupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // aligned with ip-api.com free tier limit (~45/min shared)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Lookup rate limit exceeded. Maximum 15 lookups per minute.' }
});

app.use(cors());
app.use(express.json());
app.use(globalLimiter);

// Trust Proxy is crucial for Render/Cloud hosting to get real Client IP
app.set('trust proxy', true);

// Serve Frontend
app.use(express.static(path.join(__dirname, 'public')));

// =============================================================================
// 2. HELPER FUNCTIONS
// =============================================================================

// Validate IPv4 (strict octet range 0-255)
function isIp(str) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(str)) return false;
  return str.split('.').every(octet => {
    const n = parseInt(octet, 10);
    return n >= 0 && n <= 255;
  });
}

// Fetch Geo-Location
async function getGeoInfo(ip) {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,isp,lat,lon,timezone,org,as`);
    const data = await response.json();
    return data.status === 'success' ? data : null;
  } catch { return null; }
}

// Fetch Server Headers
async function getServerHeaders(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeoutId);
    return {
      status: response.status,
      statusText: response.statusText,
      server: response.headers.get('server') || null,
      poweredBy: response.headers.get('x-powered-by') || null,
      contentType: response.headers.get('content-type') || null,
      hsts: response.headers.get('strict-transport-security') ? true : false,
      xFrameOptions: response.headers.get('x-frame-options') || null,
    };
  } catch { return { error: 'Unreachable' }; }
}

// Port Scanner
function checkPort(port, host) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on('connect', () => { socket.destroy(); resolve(port); });
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
    socket.on('error', () => { socket.destroy(); resolve(null); });
    socket.connect(port, host);
  });
}

// Safe DNS Resolver
async function safeResolve(method, hostname) {
  try { return await dns[method](hostname); } catch { return []; }
}

// Developer-focused port list — all scanned in parallel, no time penalty for more ports
const PORTS_TO_SCAN = [21, 22, 25, 53, 80, 443, 3000, 3306, 5432, 5672, 6379, 8000, 8080, 8443, 9200, 27017];
const PORT_NAMES = {
  21: 'FTP', 22: 'SSH', 25: 'SMTP', 53: 'DNS',
  80: 'HTTP', 443: 'HTTPS',
  3000: 'Node.js', 3306: 'MySQL', 5432: 'PostgreSQL', 5672: 'AMQP/RabbitMQ',
  6379: 'Redis', 8000: 'HTTP-Dev', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt',
  9200: 'Elasticsearch', 27017: 'MongoDB'
};

// =============================================================================
// 3. API ROUTES
// =============================================================================

// Health Check — used by Render, Docker HEALTHCHECK, uptime monitors
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: require('./package.json').version,
    node: process.version
  });
});

// Client IP Detection
app.get('/api/whoami', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  const clientIp = (typeof ip === 'string' ? ip.split(',')[0] : ip).trim();
  res.json({ ip: clientIp });
});

// Main Intelligence Lookup
app.post('/api/lookup', lookupLimiter, async (req, res) => {
  const input = (req.body.value || '').trim();
  if (!input) return res.status(400).json({ error: 'Input is required.' });

  let result = {
    originalInput: input,
    timestamp: new Date().toISOString(),
    portsScanned: PORTS_TO_SCAN
  };

  try {
    let targetIp = null;
    let hostname = null;

    if (isIp(input)) {
      result.inputType = 'ip';
      targetIp = input;
      hostname = input;
      try {
        const hostnames = await dns.reverse(input);
        result.hostname = hostnames[0];
        result.reverseHostnames = hostnames;
      } catch { result.hostname = null; }

    } else {
      result.inputType = 'domain';
      try {
        const value = input.includes('://') ? input : 'http://' + input;
        const urlObj = new URL(value);
        hostname = urlObj.hostname;
        result.hostname = hostname;
        result.protocol = urlObj.protocol;
      } catch {
        return res.status(400).json({ error: 'Invalid input. Please enter a valid IP, domain, or URL.' });
      }

      const addresses = await safeResolve('resolve4', hostname);
      if (!addresses.length) return res.status(400).json({ error: `Could not resolve hostname: ${hostname}` });
      targetIp = addresses[0];
      result.ipAddresses = addresses;
    }

    // All lookups run in parallel for minimum total scan time
    const [mx, txt, ns, geo, http, portResults] = await Promise.all([
      safeResolve('resolveMx', hostname),
      safeResolve('resolveTxt', hostname),
      safeResolve('resolveNs', hostname),
      getGeoInfo(targetIp),
      result.inputType !== 'ip'
        ? getServerHeaders(input.includes('://') ? input : 'http://' + input)
        : Promise.resolve(null),
      Promise.all(PORTS_TO_SCAN.map(p => checkPort(p, targetIp)))
    ]);

    result.ip = targetIp;
    result.dns = { mx, ns, txt: txt.flat() };
    result.geo = geo;
    result.http = http;
    result.openPorts = portResults
      .filter(p => p !== null)
      .map(p => ({ port: p, service: PORT_NAMES[p] || 'Unknown' }));

    res.json(result);

  } catch (err) {
    console.error(`[ERROR] Lookup failed for "${input}":`, err.message);
    res.status(500).json({ error: 'Lookup failed.', details: err.message });
  }
});

// =============================================================================
// 4. START SERVER
// =============================================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ NEXUS SYSTEM ONLINE`);
  console.log(`➜  Local:   http://localhost:${PORT}`);
  console.log(`➜  Health:  http://localhost:${PORT}/api/health`);
  console.log(`➜  Network: http://0.0.0.0:${PORT}\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[NEXUS] Shutting down gracefully...');
  process.exit(0);
});
