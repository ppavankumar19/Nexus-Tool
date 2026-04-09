# NEXUS | Network Intelligence Tool

[![Render](https://img.shields.io/badge/Render-Deployed-success)](https://nexus-tool.19062002.xyz)
[![Version](https://img.shields.io/badge/version-2.1.0-blue)](https://github.com/ppavankumar19/Nexus-Tool)
![Status](https://img.shields.io/badge/status-active-success)
![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![Stack](https://img.shields.io/badge/stack-Node.js%20%2B%20Express%20v5-cyan)

**Live Demo:** [https://nexus-tool.19062002.xyz](https://nexus-tool.19062002.xyz)

---

**NEXUS** is a full-stack OSINT (Open Source Intelligence) tool for deep analysis of IP addresses and domain names. It features an animated Cyber Command Centre interface with a terminal boot sequence, responsive grid layout, and a Node.js backend that runs 12 parallel intelligence lookups — DNS, Geo-location, Port Scanning, SSL/TLS, WHOIS, Subdomain Enumeration, Reputation Checks, and more.

---

## Key Features (V2.1)

### Intelligence Capabilities

| Module | What It Does |
|--------|-------------|
| **DNS Analysis** | MX, NS, TXT (SPF/DMARC), SOA records via native `dns.promises` |
| **Geo-Location** | Country, City, ISP, ASN, Coordinates (Google Maps link), Timezone |
| **Port Scanning** | 25 default ports in parallel TCP sockets — FTP through MongoDB |
| **SSL/TLS** | Certificate issuer, subject, protocol, validity dates, days remaining |
| **HTTP Fingerprint** | Status code, Server header, security headers, auto Security Grade (A+ → F) |
| **Domain Registration** | Registrar + website link, IANA ID, domain age, expiry countdown, status badges |
| **Subdomain Enumeration** | 30-prefix parallel discovery — api, dev, staging, admin, git, etc. |
| **Reputation / DNSBL** | Real-time checks against Spamhaus, Barracuda, and CBL blacklists |
| **TCP Latency** | 3-ping average RTT with color-coded performance bar |
| **WHOIS** | Full registration record with human-readable age and expiry warnings |

### Security

- **SSRF Protection** — Blocks scanning of RFC 1918 private IPs, loopback, link-local, and multicast ranges; also blocks domains that resolve to private IPs
- **Rate Limiting** — 15 lookups/min per IP, 500 requests/15 min global
- **In-Memory Cache** — 3-minute TTL, 200-entry cap — identical scans return instantly
- **Security Headers** — HSTS, X-Frame-Options, CSP, X-Content-Type-Options, Permissions-Policy on all responses
- **No Error Leaking** — Internal error details never exposed in API responses

### UI / UX

- **Dual Themes** — Cyber (Neon Cyan/Pink) and Matrix (Retro Green Terminal), persisted in `localStorage`
- **Animated Boot Sequence** — Terminal-style startup with progress bar
- **Intro Countdown** — 10-second auto-advance splash screen (skipped on return visits)
- **9-Panel Results Grid** — All intelligence data in a responsive CSS Grid layout
- **Lookup History** — Last 8 scans in `localStorage`, one-click re-scan
- **Copy / Export** — Copy JSON to clipboard, Download `.json`, Copy cURL snippet
- **Bulk Mode** — Scan multiple targets sequentially with rate-limit-safe delays
- **System Console** — Real-time color-coded event log
- **Fully Responsive** — Mobile (360px) through large desktop (1200px+), notch-safe

---

## Results Grid Layout

```
┌──────────────────────┬──────────────────────┐
│    CORE_METRICS      │    GEO_LOCATION       │
├──────────────────────┴──────────────────────┤
│               PORT_SCAN                      │
├──────────────────────┬──────────────────────┤
│    DNS_RECORDS       │    SUBDOMAINS         │
├──────────────────────┼──────────────────────┤
│    HTTP_INTEL        │    SSL_TLS            │
├──────────────────────┼──────────────────────┤
│ DOMAIN_REGISTRATION  │  NETWORK_LATENCY      │
└──────────────────────┴──────────────────────┘
```

Mobile (≤768px): All panels stack to a single column.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 18.0.0 |
| Framework | Express v5.2.1 |
| Frontend | HTML5, CSS3 (Grid, Custom Properties), Vanilla JS ES2022 |
| DNS | `dns.promises` — Node.js native |
| Port Scan | `net` — Node.js native TCP sockets |
| SSL/TLS | `tls` — Node.js native |
| HTTP Probing | `fetch` — Node.js native (≥18) |
| Geo-Location | ip-api.com free tier |
| WHOIS | `whois-json` npm package |
| Rate Limiting | `express-rate-limit` |
| Environment | `dotenv` |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18.0.0
- npm

### Installation

```bash
git clone https://github.com/ppavankumar19/Nexus-Tool.git
cd Nexus-Tool
npm install
```

### Environment Variables

Copy the example file and configure:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server listening port |
| `GEO_API_BASE` | `http://ip-api.com/json` | Geo-location API base URL |

### Running

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

The app is available at `http://localhost:5000`.

---

## API Reference

### `GET /api/health`

Returns server status, version, uptime, and cache stats. No rate limiting.

**Response:**
```json
{
  "status": "ok",
  "version": "2.1.0",
  "uptime": 3600,
  "timestamp": "2026-04-09T12:00:00.000Z",
  "cache": { "size": 4, "ttlMs": 180000 }
}
```

---

### `GET /healthz`

Plain-text health probe for deployment platforms (Render, etc.). Returns `OK`.

---

### `GET /api/whoami`

Returns the caller's public IP address.

**Response:**
```json
{ "ip": "203.0.113.42" }
```

---

### `POST /api/lookup`

Main intelligence scan. Rate-limited to 15 requests/minute per IP.

**Request Body:**
```json
{
  "value": "github.com",
  "ports": "80,443,8080"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `value` | string | Yes | IP address, domain name, or full URL |
| `ports` | string | No | Comma-separated custom ports (max 30, range 1–65535) |

**Response:**
```json
{
  "originalInput": "github.com",
  "timestamp": "2026-04-09T12:00:00.000Z",
  "cached": false,
  "inputType": "domain",
  "hostname": "github.com",
  "ip": "140.82.113.3",
  "ipAddresses": ["140.82.113.3"],
  "protocol": "http:",
  "portsScanned": [21, 22, 25, 80, 443],
  "openPorts": [
    { "port": 80,  "service": "HTTP"  },
    { "port": 443, "service": "HTTPS" }
  ],
  "dns": {
    "mx":  [{ "exchange": "aspmx.l.google.com", "priority": 1 }],
    "ns":  ["ns-1707.awsdns-21.co.uk"],
    "txt": ["v=spf1 include:_spf.google.com ~all"],
    "soa": { "nsname": "ns-1707.awsdns-21.co.uk", "hostmaster": "...", "serial": 1 }
  },
  "geo": {
    "country": "United States", "countryCode": "US",
    "city": "San Francisco", "isp": "GitHub, Inc.",
    "org": "AS36459 GitHub, Inc.", "as": "AS36459 GitHub, Inc.",
    "lat": 37.3861, "lon": -122.0839, "timezone": "America/Los_Angeles"
  },
  "http": {
    "status": 200, "statusText": "OK",
    "server": "GitHub.com", "poweredBy": null,
    "hsts": true, "xFrameOptions": "deny",
    "csp": "default-src 'none'", "xContentTypeOptions": "nosniff",
    "permissionsPolicy": "interest-cohort=()"
  },
  "ssl": {
    "issuer": "DigiCert Inc", "subject": "github.com",
    "protocol": "TLSv1.3",
    "validFrom": "Nov  4 00:00:00 2025 GMT",
    "validTo":   "Nov  6 23:59:59 2026 GMT",
    "daysRemaining": 242
  },
  "whois": {
    "registrar": "MarkMonitor, Inc.",
    "registrarUrl": "http://www.markmonitor.com",
    "registrarIanaId": "292",
    "creationDate": "2007-10-09T18:20:50Z",
    "updatedDate":  "2022-09-25T09:10:44Z",
    "expirationDate": "2026-10-09T18:20:50Z",
    "status": ["clientDeleteProhibited", "clientTransferProhibited"],
    "domainAgeDays": 6756,
    "daysUntilExpiry": 183
  },
  "subdomains": ["www.github.com", "api.github.com", "git.github.com"],
  "reputation": [
    { "list": "zen.spamhaus.org",      "listed": false },
    { "list": "b.barracudacentral.org","listed": false },
    { "list": "cbl.abuseat.org",       "listed": false }
  ],
  "latency": { "avg": 43, "times": [42, 44, 43] }
}
```

**Error Responses:**

| Status | Condition | Message |
|--------|-----------|---------|
| `400` | Missing input | `"Input is required."` |
| `400` | Private/reserved IP | `"Scanning private or reserved IP addresses is not permitted."` |
| `400` | Domain resolves to private IP | `"Target resolves to a private IP address. Scanning is not permitted."` |
| `400` | Unresolvable hostname | `"Could not resolve hostname: <hostname>"` |
| `400` | Malformed URL/input | `"Invalid input. Please enter a valid IP, domain, or URL."` |
| `429` | Rate limit exceeded | `"Lookup rate limit exceeded. Maximum 15 lookups per minute."` |
| `500` | Internal error | `"An unexpected error occurred during the lookup. Please try again."` |

---

## Deployment

The project is deployed on **Render** (free tier) with automatic deploys from the `main` branch.

- **Build Command:** *(none — Node.js detected automatically)*
- **Start Command:** `npm start`
- **Health Check:** `GET /healthz` → `200 OK`
- **Environment Variables:** Set `PORT` and optionally `GEO_API_BASE` in Render dashboard

---

## Project Structure

```
Nexus-Tool/
├── server.js           # Express backend — all API routes and intelligence logic
├── public/
│   ├── index.html      # Single-page frontend — CSS + JS inline, no build step
│   └── favicon.ico     # Browser tab icon
├── .env.example        # Environment variable template
├── package.json        # Dependencies and npm scripts
├── README.md           # Project overview and API reference
├── specifications.md   # Technical specifications and data contracts
└── scope.md            # Process flows, workflows, and architecture diagrams
```

---

## License

MIT — see [LICENSE](LICENSE) for details.

**Built by Pavan Kumar**
