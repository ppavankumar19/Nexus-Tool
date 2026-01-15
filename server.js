const express = require('express');
const dns = require('dns').promises;
const path = require('path');
const cors = require('cors');
const net = require('net'); // ✅ Added for Port Scanning

const app = express();
const PORT = process.env.PORT || 5000;

// ==== MIDDLEWARE ====
app.use(cors());
app.use(express.json());

// ✅ SERVE FRONTEND
app.use(express.static(path.join(__dirname, 'public')));

// ==== HELPERS ====
function isIp(str) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(str);
}

// 1. Geo-Location
async function getGeoInfo(ip) {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,isp,lat,lon,timezone,org`);
    const data = await response.json();
    return data.status === 'success' ? data : null;
  } catch (error) { return null; }
}

// 2. Server Headers
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

// 3. ✅ Port Scanner (New Feature)
function checkPort(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500); // 1.5s timeout per port
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(port); // Port is Open
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null); // Port Closed/Timeout
    });
    
    socket.on('error', (err) => {
      socket.destroy();
      resolve(null); // Port Closed/Error
    });
    
    socket.connect(port, host);
  });
}

// Helper to Safe Resolve DNS
async function safeResolve(method, hostname) {
  try { return await dns[method](hostname); } catch (e) { return []; }
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
    // Determine Target IP
    let targetIp = null;
    let hostname = null;

    if (isIp(input)) {
      result.inputType = 'ip';
      targetIp = input;
      hostname = input; // fallback
      
      // Reverse DNS
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

    // ✅ Define Ports to Scan
    // 21:FTP, 22:SSH, 80:HTTP, 443:HTTPS, 3306:MySQL, 8080:Alt-Web
    const portsToScan = [21, 22, 80, 443, 3306, 8080];

    // Execute All Scans in Parallel
    const [mx, txt, ns, geo, headers, openPorts] = await Promise.all([
      safeResolve('resolveMx', hostname),
      safeResolve('resolveTxt', hostname),
      safeResolve('resolveNs', hostname),
      getGeoInfo(targetIp),
      result.inputType === 'url' ? getServerHeaders(input.includes('://') ? input : 'http://' + input) : Promise.resolve(null),
      Promise.all(portsToScan.map(p => checkPort(p, targetIp))) // Scan ports on the IP
    ]);

    result.ip = targetIp; // Ensure IP is set for frontend
    result.dns = { mx, txt: txt.flat(), ns };
    result.geo = geo;
    result.http = headers;
    // Filter out nulls to get only open ports
    result.openPorts = openPorts.filter(p => p !== null);

    res.json(result);

  } catch (err) {
    res.status(500).json({ error: 'Lookup Failed', details: err.message });
  }
});

// ==== START ====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ NEXUS SYSTEM ONLINE`);
  console.log(`➜  Local:   http://localhost:${PORT}`);
});
