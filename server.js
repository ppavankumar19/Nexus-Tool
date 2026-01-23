const express = require('express');
const dns = require('dns').promises;
const path = require('path');
const cors = require('cors');
const net = require('net'); // Required for Port Scanning

const app = express();
const PORT = process.env.PORT || 5000;

// =============================================================================
// 1. MIDDLEWARE
// =============================================================================
app.use(cors());
app.use(express.json());

// Trust Proxy is crucial for Render/Cloud hosting to get real Client IP
app.set('trust proxy', true);

// ✅ SERVE FRONTEND
app.use(express.static(path.join(__dirname, 'public')));

// =============================================================================
// 2. HELPER FUNCTIONS
// =============================================================================

function isIp(str) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(str);
}

// Fetch Geo-Location
async function getGeoInfo(ip) {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,isp,lat,lon,timezone,org`);
    const data = await response.json();
    return data.status === 'success' ? data : null;
  } catch (error) { return null; }
}

// Server Headers
async function getServerHeaders(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); 
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeoutId);
    return {
      status: response.status,
      server: response.headers.get('server') || 'Hidden',
      poweredBy: response.headers.get('x-powered-by') || 'Hidden'
    };
  } catch (error) { return { error: 'Unreachable' }; }
}

// Port Scanner
function checkPort(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500); 
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(port); 
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null); 
    });
    
    socket.on('error', (err) => {
      socket.destroy();
      resolve(null); 
    });
    
    socket.connect(port, host);
  });
}

// Safe DNS
async function safeResolve(method, hostname) {
  try { return await dns[method](hostname); } catch (e) { return []; }
}

// =============================================================================
// 3. API ROUTES
// =============================================================================

// ✅ NEW FEATURE: Get Client (Your) IP Address
app.get('/api/whoami', (req, res) => {
  // x-forwarded-for is the standard header for proxies (like Render)
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  // If multiple IPs (client, proxy1, proxy2), take the first one
  const clientIp = typeof ip === 'string' ? ip.split(',')[0].trim() : ip;
  res.json({ ip: clientIp });
});

app.post('/api/lookup', async (req, res) => {
  const input = (req.body.value || '').trim();
  if (!input) return res.status(400).json({ error: 'Empty input' });

  let result = {
    originalInput: input,
    timestamp: new Date().toISOString()
  };

  try {
    // --- Determine Target IP & Hostname ---
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
      } catch (e) { result.hostname = null; }

    } else {
      result.inputType = 'url';
      try {
        const value = input.includes('://') ? input : 'http://' + input;
        const urlObj = new URL(value);
        hostname = urlObj.hostname;
        result.hostname = hostname;
        result.protocol = urlObj.protocol;
      } catch { return res.status(400).json({ error: 'Invalid URL' }); }

      const addresses = await safeResolve('resolve4', hostname);
      if (!addresses || addresses.length === 0) return res.status(400).json({ error: 'Could not resolve IP' });
      targetIp = addresses[0];
      result.ipAddresses = addresses;
    }

    // --- Define Ports to Scan ---
    const portsToScan = [21, 22, 80, 443, 3306, 8080];

    // --- Execute Parallel Lookups ---
    const [mx, txt, ns, geo, headers, openPorts] = await Promise.all([
      safeResolve('resolveMx', hostname),
      safeResolve('resolveTxt', hostname),
      safeResolve('resolveNs', hostname),
      getGeoInfo(targetIp),
      result.inputType === 'url' ? getServerHeaders(input.includes('://') ? input : 'http://' + input) : Promise.resolve(null),
      Promise.all(portsToScan.map(p => checkPort(p, targetIp)))
    ]);

    // --- Construct Response ---
    result.ip = targetIp;
    result.dns = { mx, txt: txt.flat(), ns };
    result.geo = geo;
    result.http = headers;
    result.openPorts = openPorts.filter(p => p !== null);

    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lookup Failed', details: err.message });
  }
});

// =============================================================================
// 4. START SERVER
// =============================================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ NEXUS SYSTEM ONLINE`);
  console.log(`➜  Local:   http://localhost:${PORT}`);
  console.log(`➜  Network: http://0.0.0.0:${PORT}\n`);
});
