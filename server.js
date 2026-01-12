const express = require('express');
const dns = require('dns').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// ==== MIDDLEWARE ====
app.use(cors());
app.use(express.json());

// ✅ SERVE FRONTEND (Single Server Mode)
app.use(express.static(path.join(__dirname, 'public')));

// ==== HELPERS ====
function isIp(str) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(str);
}

// Fetch Geo-Location (Free API)
async function getGeoInfo(ip) {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,isp,lat,lon,timezone,org`);
    const data = await response.json();
    return data.status === 'success' ? data : null;
  } catch (error) {
    return null;
  }
}

// Fetch Server Headers (Fingerprinting)
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
  } catch (error) {
    return { error: 'Unreachable' };
  }
}

// Safe DNS lookup helper
async function safeResolve(method, hostname) {
  try {
    return await dns[method](hostname);
  } catch (e) {
    return [];
  }
}

// ==== API ROUTES ====
app.post('/api/lookup', async (req, res) => {
  const input = (req.body.value || '').trim();
  if (!input) return res.status(400).json({ error: 'Empty input' });

  let result = {
    originalInput: input,
    timestamp: new Date().toISOString()
  };

  try {
    // ----------------------------
    // SCENARIO 1: Input is IP
    // ----------------------------
    if (isIp(input)) {
      result.inputType = 'ip';
      result.ip = input;
      
      const [hostnames, geo] = await Promise.all([
        dns.reverse(input).catch(() => []),
        getGeoInfo(input)
      ]);

      result.hostname = hostnames[0] || null;
      result.reverseHostnames = hostnames;
      result.geo = geo;
      return res.json(result);
    }

    // ----------------------------
    // SCENARIO 2: Input is URL/Domain
    // ----------------------------
    let urlObj;
    try {
      const value = input.includes('://') ? input : 'http://' + input;
      urlObj = new URL(value);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    result.inputType = 'url';
    result.hostname = urlObj.hostname;
    result.protocol = urlObj.protocol;

    // 1. Resolve IP (Required for Geo)
    const addresses = await safeResolve('resolve4', urlObj.hostname);
    if (!addresses || addresses.length === 0) {
      return res.status(400).json({ error: 'Could not resolve IP' });
    }
    result.ipAddresses = addresses;

    // 2. Parallel Advanced Lookups
    const [mx, txt, ns, geo, headers] = await Promise.all([
      safeResolve('resolveMx', urlObj.hostname),
      safeResolve('resolveTxt', urlObj.hostname),
      safeResolve('resolveNs', urlObj.hostname),
      getGeoInfo(addresses[0]),
      getServerHeaders(urlObj.href)
    ]);

    result.dns = { mx, txt: txt.flat(), ns };
    result.geo = geo;
    result.http = headers;

    res.json(result);

  } catch (err) {
    res.status(500).json({ error: 'Lookup Failed', details: err.message });
  }
});

// ==== START ====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ NEXUS SYSTEM ONLINE`);
  console.log(`➜  Local:   http://localhost:${PORT}`);
  console.log(`➜  Network: http://0.0.0.0:${PORT}\n`);
});
