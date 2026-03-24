require('dotenv').config();

const express = require('express');
const dns = require('dns').promises;
const path = require('path');
const cors = require('cors');
const net = require('net');
const tls = require('tls');
const whois = require('whois-json');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;
const GEO_API_BASE = process.env.GEO_API_BASE || 'http://ip-api.com/json';

// =============================================================================
// 1. HEALTH CHECK & MIDDLEWARE
// =============================================================================

// Health Check — Respond BEFORE rate limiting or static files
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Root Health Check — Added to ensure Render's root pings succeed instantly
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Rate Limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased for Render health checks and initial bursts
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
// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Updated CSP to allow data: images and blob: downloads
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://ip-api.com;");
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
  next();
});


app.use(globalLimiter);

// Trust Proxy — Essential for Render/Cloud (X-Forwarded-For)
app.set('trust proxy', 1);

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
    const response = await fetch(`${GEO_API_BASE}/${ip}?fields=status,country,countryCode,city,isp,lat,lon,timezone,org,as`);
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
      csp: response.headers.get('content-security-policy') || null,
      xContentTypeOptions: response.headers.get('x-content-type-options') || null,
      permissionsPolicy: response.headers.get('permissions-policy') || null,
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

// SSL/TLS Details
function getSslDetails(hostname, port = 443) {
  return new Promise(resolve => {
    const socket = tls.connect({
      host: hostname,
      port: port,
      servername: hostname,
      rejectUnauthorized: false
    }, () => {
      const cert = socket.getPeerCertificate();
      const protocol = socket.getProtocol();
      socket.end();
      if (!cert || !Object.keys(cert).length) return resolve(null);
      resolve({
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        issuer: cert.issuer?.O || cert.issuer?.CN,
        subject: cert.subject?.CN,
        protocol: protocol,
        daysRemaining: Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      });
    });
    socket.setTimeout(2500);
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
    socket.on('error', () => { socket.destroy(); resolve(null); });
  });
}

// WHOIS Lookup
async function getWhois(target) {
  try {
    const results = await whois(target, { follow: 2, timeout: 5000 }); // Increased follow and timeout
    if (!results || Object.keys(results).length === 0) return null;
    return {
      registrar: results.registrar || results.Registrar || results['Registrar'] || 'Unknown',
      creationDate: results.creationDate || results.CreationDate || results['Creation Date'],
      updatedDate: results.updatedDate || results.UpdatedDate || results['Updated Date'],
      expirationDate: results.registrarRegistrationExpirationDate || results.RegistryExpiryDate || results.ExpiryDate || results['Registry Expiry Date'],
      status: results.domainStatus || results.DomainStatus || results['Domain Status']
    };
  } catch (err) {
    console.error(`[WHOIS] Error for ${target}:`, err.message);
    return null; 
  }
}

// Subdomain Enumeration - Expanded List
const COMMON_SUBDOMAINS = [
  'www', 'mail', 'api', 'dev', 'staging', 'test', 'blog', 'app', 'cdn', 'vpn',
  'admin', 'portal', 'shop', 'cloud', 'remote', 'secure', 'support', 'beta', 'git', 'internal',
  'api-dev', 'api-staging', 'm', 'mobile', 'webmail', 'smtp', 'ns1', 'ns2', 'autodiscover', 'owa'
];
async function enumerateSubdomains(domain) {
  const found = [];
  // Use smaller chunks for DNS stability
  const chunks = [];
  for (let i = 0; i < COMMON_SUBDOMAINS.length; i += 10) chunks.push(COMMON_SUBDOMAINS.slice(i, i + 10));
  
  for (const chunk of chunks) {
    await Promise.all(chunk.map(async sub => {
      try {
        const host = `${sub}.${domain}`;
        const addresses = await dns.resolve4(host);
        if (addresses && addresses.length) found.push(host);
      } catch { /* ignore */ }
    }));
  }
  return found;
}

// Reputation / Blacklist
const DNSBL_LISTS = ['zen.spamhaus.org', 'b.barracudacentral.org', 'cbl.abuseat.org'];
async function checkReputation(ip) {
  if (!ip) return [];
  const reversed = ip.split('.').reverse().join('.');
  const results = [];
  await Promise.all(DNSBL_LISTS.map(async list => {
    try {
      await dns.resolve4(`${reversed}.${list}`);
      results.push({ list, listed: true });
    } catch {
      results.push({ list, listed: false });
    }
  }));
  return results;
}

// TCP Latency
function checkLatency(host, port = 80, pings = 3) {
  return new Promise(async resolve => {
    if (!host) return resolve(null);
    const times = [];
    for (let i = 0; i < pings; i++) {
      const start = Date.now();
      const time = await new Promise(res => {
        const socket = new net.Socket();
        socket.setTimeout(1500);
        socket.on('connect', () => { socket.destroy(); res(Date.now() - start); });
        socket.on('timeout', () => { socket.destroy(); res(null); });
        socket.on('error', () => { socket.destroy(); res(null); });
        socket.connect(port, host);
      });
      if (time !== null) times.push(time);
    }
    if (!times.length) return resolve(null);
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    resolve({ times, avg });
  });
}

// Developer-focused port list — expanded for deeper scans
const PORTS_TO_SCAN = [
  21, 22, 23, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 
  1433, 3000, 3306, 3389, 5432, 5672, 6379, 8000, 8080, 8443, 9200, 27017
];
const PORT_NAMES = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
  80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 
  465: 'SMTPS', 587: 'Submission', 993: 'IMAPS', 995: 'POP3S',
  1433: 'MSSQL', 3000: 'Node.js', 3306: 'MySQL', 3389: 'RDP', 
  5432: 'PostgreSQL', 5672: 'AMQP/RabbitMQ', 6379: 'Redis', 
  8000: 'HTTP-Dev', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt',
  9200: 'Elasticsearch', 27017: 'MongoDB'
};

// =============================================================================
// 3. API ROUTES
// =============================================================================

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

  const customPortsInput = (req.body.ports || '').trim();
  let PORTS_TO_USE = PORTS_TO_SCAN;
  if (customPortsInput) {
    const parsed = customPortsInput.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p > 0 && p <= 65535);
    if (parsed.length) PORTS_TO_USE = [...new Set(parsed)].slice(0, 30); // Unique, max 30
  }

  let result = {
    originalInput: input,
    timestamp: new Date().toISOString(),
    portsScanned: PORTS_TO_USE
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
    const [mx, txt, ns, geo, http, portResults, ssl, whoisData, subdomains, reputation, latency] = await Promise.all([
      safeResolve('resolveMx', hostname),
      safeResolve('resolveTxt', hostname),
      safeResolve('resolveNs', hostname),
      getGeoInfo(targetIp),
      result.inputType !== 'ip'
        ? getServerHeaders(input.includes('://') ? input : 'http://' + input)
        : Promise.resolve(null),
      Promise.all(PORTS_TO_USE.map(p => checkPort(p, targetIp))),
      result.inputType !== 'ip' ? getSslDetails(hostname, PORTS_TO_USE.includes(443) ? 443 : PORTS_TO_USE[0]) : Promise.resolve(null),
      getWhois(result.inputType !== 'ip' ? hostname : targetIp),
      result.inputType !== 'ip' ? enumerateSubdomains(hostname) : Promise.resolve([]),
      targetIp ? checkReputation(targetIp) : Promise.resolve([]),
      checkLatency(targetIp, result.inputType !== 'ip' && PORTS_TO_USE.includes(443) ? 443 : PORTS_TO_USE[0])
    ]);

    result.ip = targetIp;
    result.dns = { mx, ns, txt: txt.flat() };
    result.geo = geo;
    result.http = http;
    result.ssl = ssl;
    result.whois = whoisData;
    result.subdomains = subdomains;
    result.reputation = reputation;
    result.latency = latency;
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
  console.log(`➜  Network: Port ${PORT} (0.0.0.0)\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[NEXUS] Shutting down gracefully...');
  process.exit(0);
});
