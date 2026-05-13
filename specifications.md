# NEXUS — Technical Specifications

**Version:** 2.1.0
**Last Updated:** April 2026
**Author:** Pavan Kumar

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Environment & Configuration](#2-environment--configuration)
3. [Dependencies](#3-dependencies)
4. [Backend — Module Specifications](#4-backend--module-specifications)
5. [API Endpoint Contracts](#5-api-endpoint-contracts)
6. [Data Models](#6-data-models)
7. [Rate Limiting & Caching](#7-rate-limiting--caching)
8. [Security Specifications](#8-security-specifications)
9. [Frontend — Architecture](#9-frontend--architecture)
10. [Frontend — Panel Data Mapping](#10-frontend--panel-data-mapping)
11. [CSS Architecture](#11-css-architecture)
12. [Responsive Breakpoints](#12-responsive-breakpoints)
13. [Browser & Runtime Compatibility](#13-browser--runtime-compatibility)
14. [Error Handling Matrix](#14-error-handling-matrix)

---

## 1. Project Overview

NEXUS is a single-server, full-stack Node.js application. There is no database, no build pipeline, and no frontend framework. The entire frontend is served as one static HTML file (`public/index.html`) with all CSS and JavaScript inlined. The backend (`server.js`) is a single Express application that handles all API routes and intelligence logic.

```
Client Browser  ←──HTTP──→  Express (server.js)  ←──TCP/DNS/HTTP──→  Internet
```

---

## 2. Environment & Configuration

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | integer | `5000` | TCP port the server binds to. Render sets this automatically. |
| `GEO_API_BASE` | string | `http://ip-api.com/json` | Base URL of the geo-location API. Override for self-hosted alternatives. |

### Runtime Requirements

| Requirement | Minimum Version | Reason |
|-------------|----------------|--------|
| Node.js | 18.0.0 | Native `fetch()`, `dns.promises` with full API, `tls` improvements |
| npm | 8.0.0 | Workspaces support (not used, but standard) |

### Startup Sequence

1. `dotenv` loads `.env` into `process.env`
2. Express app is created
3. Health check routes registered (before rate limiters)
4. `trust proxy` set to `1` for Render/cloud (before rate limiters so `req.ip` is correct)
5. CORS, JSON parser, security headers middleware applied
6. Rate limiters initialized
7. Static file serving from `./public`
8. API routes registered
9. `app.listen(PORT, '0.0.0.0')` — binds to all network interfaces

---

## 3. Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^5.2.1 | HTTP server framework |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing headers |
| `dotenv` | ^16.4.5 | Environment variable loading |
| `express-rate-limit` | ^7.4.1 | Per-IP and global request rate limiting |
| `whois-json` | ^2.0.4 | WHOIS protocol queries with JSON parsing |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| `nodemon` | ^3.1.9 | Auto-restart on file changes during development |

### Native Node.js Modules Used

| Module | Usage |
|--------|-------|
| `dns.promises` | DNS record resolution (MX, NS, TXT, SOA, A, reverse) |
| `net` | TCP socket connections for port scanning and latency |
| `tls` | TLS handshake for SSL certificate extraction |
| `path` | Filesystem path construction for static file serving |

---

## 4. Backend — Module Specifications

### 4.1 `isIp(str: string) → boolean`

Validates whether a string is a valid IPv4 address.

- Regex pre-check: must match `^\d{1,3}(\.\d{1,3}){3}$`
- Each octet parsed as integer and checked: `0 ≤ n ≤ 255`
- Returns `false` for any partial match, leading zeros, or out-of-range octets

```
"8.8.8.8"       → true
"256.0.0.1"     → false
"8.8.8"         → false
"8.8.8.08"      → true   (leading zeros not rejected; parseInt("08",10) = 8)
```

---

### 4.2 `isPrivateIp(ip: string) → boolean`

Checks whether a validated IPv4 address falls within a private or reserved range.

| Range | Description |
|-------|-------------|
| `0.0.0.0/8` | Reserved (first octet = 0) |
| `10.0.0.0/8` | Private (RFC 1918) |
| `127.0.0.0/8` | Loopback |
| `169.254.0.0/16` | Link-local (APIPA) |
| `172.16.0.0/12` | Private (RFC 1918) — octets 172.16–172.31 |
| `192.168.0.0/16` | Private (RFC 1918) |
| `224.0.0.0+` | Multicast and reserved (first octet ≥ 224) |

Called on both direct IP inputs and on the resolved IP of domain inputs (SSRF protection).

---

### 4.3 `getGeoInfo(ip: string) → Promise<GeoResult | null>`

Fetches geo-location data from ip-api.com.

- **Endpoint:** `GET {GEO_API_BASE}/{ip}?fields=status,country,countryCode,city,isp,lat,lon,timezone,org,as`
- **Timeout:** Node.js default fetch timeout
- **Fields requested:** status, country, countryCode, city, isp, lat, lon, timezone, org, as
- Returns `null` on any network error or non-success API status

---

### 4.4 `getServerHeaders(url: string) → Promise<HttpResult>`

Fetches HTTP response headers via a HEAD request.

- **Method:** `HEAD`
- **Timeout:** 4,000 ms (AbortController)
- **Follow redirects:** Yes (`redirect: 'follow'`)
- **Extracted fields:** status, statusText, server, x-powered-by, content-type, strict-transport-security, x-frame-options, content-security-policy, x-content-type-options, permissions-policy
- Returns `{ error: 'Unreachable' }` on timeout or network failure

---

### 4.5 `checkPort(port: number, host: string) → Promise<number | null>`

Tests whether a TCP port is open on a host.

- **Timeout:** 1,500 ms
- **Method:** Raw TCP socket connection (`net.Socket`)
- Returns the port number if connected successfully, `null` if timed out or refused

---

### 4.6 `safeResolve(method: string, hostname: string) → Promise<any[]>`

Wrapper around `dns.promises[method](hostname)`.

- Returns empty array `[]` on any DNS error (NXDOMAIN, ENODATA, SERVFAIL, etc.)
- Used for: `resolveMx`, `resolveTxt`, `resolveNs`, `resolveSoa`, `resolve4`

---

### 4.7 `getSslDetails(hostname: string, port?: number) → Promise<SslResult | null>`

Extracts SSL/TLS certificate details via a TLS handshake.

- **Default port:** 443
- **Timeout:** 2,500 ms
- **SNI:** Enabled (`servername: hostname`)
- **Certificate validation:** Disabled (`rejectUnauthorized: false`) — intentional for OSINT scanning
- **Extracted fields:** validFrom, validTo, issuer (O or CN), subject (CN), protocol (TLSv1.2/1.3), daysRemaining
- Returns `null` if no certificate received or on error

---

### 4.8 `getWhois(target: string) → Promise<WhoisResult | null>`

Queries WHOIS servers for domain or IP registration data.

- **Library:** `whois-json`
- **Follow redirects:** 2 hops (handles thin/thick registries)
- **Timeout:** 5,000 ms
- **Field extraction:** Uses a `pick()` helper that tries multiple key name variants per field (handles different registrar formats)
- **Status parsing:** Strips ICANN URLs from status strings, normalizes to array, caps at 5 entries
- **Computed fields:** `domainAgeDays` (days since creation), `daysUntilExpiry` (days until expiration)
- Returns `null` on any error or empty response

---

### 4.9 `enumerateSubdomains(domain: string) → Promise<string[]>`

Tests 30 common subdomain prefixes against the target domain using DNS A-record lookups.

**Wordlist:**
```
www, mail, api, dev, staging, test, blog, app, cdn, vpn,
admin, portal, shop, cloud, remote, secure, support, beta, git, internal,
api-dev, api-staging, m, mobile, webmail, smtp, ns1, ns2, autodiscover, owa
```

- Processed in chunks of 10 for DNS stability
- Returns only subdomains with at least one resolved A record

---

### 4.10 `checkReputation(ip: string) → Promise<ReputationEntry[]>`

Checks an IP against DNSBL (DNS-based Blackhole List) servers.

**Lists checked:**
| List | Focus |
|------|-------|
| `zen.spamhaus.org` | Spam, malware, botnet IPs |
| `b.barracudacentral.org` | Email spam sources |
| `cbl.abuseat.org` | Compromised/infected hosts |

- Uses reversed IP octets as DNS lookup prefix: `x.x.x.x` → `x.x.x.x.{list}`
- A successful DNS resolution = listed; NXDOMAIN = clean
- All 3 lists queried in parallel

---

### 4.11 `checkLatency(host: string, port?: number, pings?: number) → Promise<LatencyResult | null>`

Measures TCP round-trip time to the target.

- **Default port:** 80 (or 443 if available)
- **Default pings:** 3
- **Timeout per ping:** 1,500 ms
- **Metric:** Wall-clock time from `Date.now()` before connect to `Date.now()` on connect event
- Returns `null` if all pings fail

---

### 4.12 In-Memory Cache

| Property | Value |
|----------|-------|
| Implementation | `Map` object (`CACHE`) |
| Key | `{input}|{ports}` (e.g., `github.com|80,443`) |
| TTL | 180,000 ms (3 minutes) |
| Max entries | 200 (evicts oldest on overflow) |
| Eviction | Single oldest entry evicted when size reaches 200 |
| Cache indicator | `cached: true` added to response when served from cache |

---

### 4.13 Default Port List

The 25 ports scanned by default when no custom ports are specified:

| Port | Service | Port | Service |
|------|---------|------|---------|
| 21 | FTP | 993 | IMAPS |
| 22 | SSH | 995 | POP3S |
| 23 | Telnet | 1433 | MSSQL |
| 25 | SMTP | 3000 | Node.js |
| 53 | DNS | 3306 | MySQL |
| 80 | HTTP | 3389 | RDP |
| 110 | POP3 | 5432 | PostgreSQL |
| 143 | IMAP | 5672 | AMQP/RabbitMQ |
| 443 | HTTPS | 6379 | Redis |
| 465 | SMTPS | 8000 | HTTP-Dev |
| 587 | Submission | 8080 | HTTP-Alt |
| | | 8443 | HTTPS-Alt |
| | | 9200 | Elasticsearch |
| | | 27017 | MongoDB |

---

## 5. API Endpoint Contracts

### `GET /api/health` — No rate limit

**Response 200:**
```json
{
  "status": "ok",
  "version": "2.1.0",
  "uptime": 7200,
  "timestamp": "2026-04-09T12:00:00.000Z",
  "cache": {
    "size": 12,
    "ttlMs": 180000
  }
}
```

---

### `GET /healthz` — No rate limit

**Response 200:** `OK` (plain text)
Purpose: Render.com health probe compatibility.

---

### `GET /api/whoami` — Global rate limit only

**Response 200:**
```json
{ "ip": "203.0.113.42" }
```

IP sourced from `X-Forwarded-For` header (first entry), falling back to `req.socket.remoteAddress`.

---

### `POST /api/lookup` — Lookup rate limit (15/min) + Global rate limit

**Request:**
```
Content-Type: application/json

{
  "value": string,   // required — IP, domain, or URL
  "ports": string    // optional — "80,443,8080" (max 30 unique ports)
}
```

**Response 200:**
See [Data Models → LookupResponse](#61-lookupresponse) below.

**Error responses:**

| HTTP | Body | Trigger |
|------|------|---------|
| 400 | `{ "error": "Input is required." }` | Empty `value` field |
| 400 | `{ "error": "Scanning private or reserved IP addresses is not permitted." }` | Private IP input |
| 400 | `{ "error": "Target resolves to a private IP address. Scanning is not permitted." }` | Domain → private IP |
| 400 | `{ "error": "Could not resolve hostname: <name>" }` | DNS A-record failure |
| 400 | `{ "error": "Invalid input. Please enter a valid IP, domain, or URL." }` | Malformed input |
| 429 | `{ "error": "Lookup rate limit exceeded. Maximum 15 lookups per minute." }` | Rate limit |
| 500 | `{ "error": "An unexpected error occurred during the lookup. Please try again." }` | Uncaught exception |

---

## 6. Data Models

### 6.1 LookupResponse

```typescript
{
  originalInput:    string;
  timestamp:        string;        // ISO 8601
  cached:           boolean;       // true if served from cache
  inputType:        "ip" | "domain";
  hostname:         string | null;
  ip:               string;
  ipAddresses:      string[];      // domain only
  reverseHostnames: string[];      // IP input only
  protocol:         string | null; // "http:" | "https:"
  portsScanned:     number[];
  openPorts:        PortEntry[];
  dns:              DnsResult;
  geo:              GeoResult | null;
  http:             HttpResult | null;
  ssl:              SslResult | null;
  whois:            WhoisResult | null;
  subdomains:       string[];
  reputation:       ReputationEntry[];
  latency:          LatencyResult | null;
}
```

### 6.2 PortEntry

```typescript
{ port: number; service: string; }
```

### 6.3 DnsResult

```typescript
{
  mx:  { exchange: string; priority: number }[];
  ns:  string[];
  txt: string[];
  soa: {
    nsname: string; hostmaster: string; serial: number;
    refresh: number; retry: number; expire: number; minttl: number;
  } | null;
}
```

### 6.4 GeoResult

```typescript
{
  status:      "success" | "fail";
  country:     string;
  countryCode: string;
  city:        string;
  isp:         string;
  org:         string;
  as:          string;
  lat:         number;
  lon:         number;
  timezone:    string;
}
```

### 6.5 HttpResult

```typescript
{
  status:              number;
  statusText:          string;
  server:              string | null;
  poweredBy:           string | null;
  contentType:         string | null;
  hsts:                boolean;
  xFrameOptions:       string | null;
  csp:                 string | null;
  xContentTypeOptions: string | null;
  permissionsPolicy:   string | null;
} | { error: "Unreachable" }
```

### 6.6 SslResult

```typescript
{
  validFrom:     string;
  validTo:       string;
  issuer:        string | null;
  subject:       string | null;
  protocol:      string;        // e.g. "TLSv1.3"
  daysRemaining: number;
} | null
```

### 6.7 WhoisResult

```typescript
{
  registrar:        string;
  registrarUrl:     string | null;
  registrarIanaId:  string | null;
  creationDate:     string | null;
  updatedDate:      string | null;
  expirationDate:   string | null;
  status:           string[];      // cleaned, max 5 entries
  domainAgeDays:    number | null;
  daysUntilExpiry:  number | null;
} | null
```

### 6.8 ReputationEntry

```typescript
{ list: string; listed: boolean; }
```

### 6.9 LatencyResult

```typescript
{ avg: number; times: number[]; } | null
```

---

## 7. Rate Limiting & Caching

### Rate Limiters

| Limiter | Window | Max Requests | Applied To |
|---------|--------|-------------|------------|
| `lookupLimiter` | 60 seconds | 15 | `POST /api/lookup` only |
| `globalLimiter` | 15 minutes | 500 | All routes (except health checks) |

- Both use standard `RateLimit-*` response headers
- `trust proxy: 1` is set so `X-Forwarded-For` is used for IP identification
- Health check routes (`/api/health`, `/healthz`) are registered **before** the global limiter

### Cache Behavior

```
Request arrives
     │
     ▼
Build cacheKey = `${input}|${ports}`
     │
     ├── Key exists AND (now - ts) < 180,000ms  →  Return cached + cached:true
     │
     └── Miss → Run full lookup → Store result → Return result + cached:false
```

Cache does NOT store error responses. Only successful 200 results are cached.

---

## 8. Security Specifications

### Response Security Headers

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://ip-api.com;` |
| `Permissions-Policy` | `geolocation=(), microphone=()` |

### SSRF Protection

Private IP check applied at two points:

1. **Direct IP input** — `isPrivateIp(input)` checked immediately after parsing
2. **Domain input** — `isPrivateIp(resolvedIp)` checked after A-record resolution

Private ranges blocked: `0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `224.0.0.0+`

### Input Validation

- Client-side: IP octet range check + domain name regex before any network request
- Server-side: URL constructor validation for domain/URL inputs
- Custom ports: integer parse, range `1–65535`, deduplication, max 30 entries
- Error messages never expose internal stack traces or `err.message`

---

## 9. Frontend — Architecture

The frontend is a single-page application in `public/index.html` with three distinct phases:

### Phase 1 — Boot Screen

- Triggered immediately on page load
- Renders 15 sequential log lines with staggered `setTimeout` delays
- Progress bar fills as `[OK]` lines appear (8 total, each = 12.5%)
- Duration: ~3,000 ms fade-out, then removed from DOM at 3,700 ms
- Checks `localStorage.getItem('nexus_intro_seen')` to decide next phase

### Phase 2 — Intro Screen (first visit only)

- 10-second SVG countdown ring animation (stroke-dashoffset from 0 → 276.46)
- Ring color shifts to pink at ≤ 3 seconds remaining
- Skippable via: Enter key, Space key, or button click
- On completion: sets `localStorage.setItem('nexus_intro_seen', 'true')`

### Phase 3 — Main Application

- Input → Validation → `POST /api/lookup` → Render results
- All panels start in `AWAITING SCAN` idle state
- Results render with staggered row animations (70 ms between rows)
- Scan history stored in `localStorage` key `nxt2h` (max 8 entries)
- Theme stored in `localStorage` key `nexus_theme`

### Key JavaScript Functions

| Function | Purpose |
|----------|---------|
| `validateInput(input)` | Client-side format check before API call |
| `run()` | Orchestrates scan: validate → fetch → render → save history |
| `render(data)` | Populates all 9 panels from API response |
| `row(id, label, value, delay, cls)` | Appends an animated data row to a panel |
| `log(msg, type)` | Appends timestamped message to system console |
| `saveH(entry)` / `renderH()` | History persistence and chip rendering |
| `showFeedback(id, text, type)` | Shows timed feedback on action buttons |
| `humanAge(days)` | Converts day count to "X yr Y mo" string |
| `fmtDate(str)` | Safe ISO date → locale string with try/catch |

---

## 10. Frontend — Panel Data Mapping

| Panel ID | API Field(s) | Notes |
|----------|-------------|-------|
| `rCore` | `inputType`, `hostname`, `ip`, `ipAddresses`, `reverseHostnames`, `protocol`, `timestamp`, `reputation` | Reputation badge appended to Core |
| `rGeo` | `geo.*` | Coordinates row is clickable → Google Maps |
| `rPorts` | `openPorts`, `portsScanned` | Badge grid for open ports; filtered list for closed |
| `rDns` | `dns.mx`, `dns.ns`, `dns.txt`, `dns.soa` | TXT records truncated at 66 chars with hover tooltip |
| `rHttp` | `http.*` | Security grade computed client-side from 5 header boolean flags |
| `rSsl` | `ssl.*` | `daysRemaining` color-coded: < 30 red, < 90 amber, ≥ 90 green |
| `rWhois` | `whois.*` | Registrar is a link if `registrarUrl` present; expiry color-coded |
| `rSub` | `subdomains[]` | Cyan badge per discovered subdomain |
| `rLat` | `latency.avg`, `latency.times` | Visual bar: 0–500 ms scale, color-coded |

### Security Grade Calculation (HTTP panel)

| Headers Present | Grade |
|----------------|-------|
| 5 of 5 | A+ |
| 4 of 5 | A |
| 3 of 5 | B |
| 2 of 5 | C |
| 1 of 5 | D |
| 0 of 5 | F |

Headers checked: HSTS, X-Frame-Options, CSP, X-Content-Type-Options, Permissions-Policy.

---

## 11. CSS Architecture

### Custom Properties (CSS Variables)

| Variable | Cyber Value | Matrix Value | Purpose |
|----------|------------|-------------|---------|
| `--bg` | `#030508` | `#000` | Page background |
| `--cyan` | `#00e5ff` | `#0f0` | Primary accent |
| `--pink` | `#ff2dff` | `#0f0` | Secondary accent |
| `--green` | `#00ff6a` | `#0f0` | Success/positive |
| `--amber` | `#ffc400` | `#0f0` | Warning |
| `--red` | `#ff3b3b` | `#0f0` | Error/danger |
| `--surface` | `rgba(0,12,24,.55)` | `rgba(0,10,0,.6)` | Panel background |
| `--border` | `rgba(0,229,255,.1)` | `rgba(0,255,0,.4)` | Panel borders |
| `--f-hud` | `'Orbitron'` | `'Orbitron'` | Headings, labels |
| `--f-mono` | `'Share Tech Mono'` | `'Share Tech Mono'` | Data values, input |
| `--f-body` | `'Rajdhani'` | `'Rajdhani'` | Descriptions, hints |

### CSS Grid Layout (Desktop)

```css
grid-template-areas:
  "core  geo"
  "ports ports"
  "dns   sub"
  "http  ssl"
  "whois lat";
```

---

## 12. Responsive Breakpoints

| Breakpoint | Range | Key Changes |
|------------|-------|-------------|
| Large desktop | ≥ 1200px | Shell max-width 1180px |
| Tablet landscape | 769–1024px | Shell full-width, reduced header padding |
| Tablet portrait | ≤ 768px | Grid goes 1-column; theme switch wraps to own row |
| Small tablet / large phone | ≤ 640px | Action panel stacks vertically; console shrinks to 100px; keyboard hint hidden |
| Mobile | ≤ 480px | App padding 8px; advanced options stack; console 90px |
| Small phone | ≤ 400px | Reduced font sizes and letter-spacing |
| Very small phone | ≤ 360px | Search row stacks; Execute button full-width |

### Safe Area Support

```css
padding-left:   max(14px, env(safe-area-inset-left));
padding-right:  max(14px, env(safe-area-inset-right));
padding-bottom: max(36px, env(safe-area-inset-bottom));
```

---

## 13. Browser & Runtime Compatibility

### Frontend

| Feature | Minimum Browser Support |
|---------|------------------------|
| CSS Grid | Chrome 57, Firefox 52, Safari 10.1 |
| CSS Custom Properties | Chrome 49, Firefox 31, Safari 9.1 |
| `fetch()` | Chrome 42, Firefox 39, Safari 10.1 |
| `navigator.clipboard` | Chrome 66, Firefox 63, Safari 13.1 |
| Canvas 2D | All modern browsers |
| `env(safe-area-inset-*)` | Chrome 69, Firefox 65, Safari 11.2 |

### Backend

| Feature | Node.js Version |
|---------|----------------|
| `fetch()` native | ≥ 18.0.0 |
| `dns.promises.resolveSoa` | ≥ 14.x |
| `tls.connect` with servername | ≥ 0.11.3 |
| `AbortController` | ≥ 15.0.0 (stable in 18+) |

---

## 14. Error Handling Matrix

| Layer | Error Source | Handling |
|-------|-------------|---------|
| Frontend validation | Bad IP / domain format | `log(msg, 'w')` — warns in console, no request sent |
| Rate limiter | > 15 req/min | HTTP 429, caught in `run()`, shown in error panel |
| DNS resolution | NXDOMAIN / timeout | `safeResolve()` returns `[]` — scan continues with empty records |
| Geo API | Network failure / rate limit | `getGeoInfo()` returns `null` — panel shows nothing |
| Port scanner | Connection refused / timeout | `checkPort()` returns `null` — port not in openPorts list |
| SSL handshake | Self-signed / expired / unreachable | `getSslDetails()` returns `null` — panel shows "No SSL/TLS info" |
| HTTP probe | Timeout / unreachable | `getServerHeaders()` returns `{ error: 'Unreachable' }` |
| WHOIS | Query failure / empty response | `getWhois()` returns `null` — panel shows "No WHOIS data available" |
| DNSBL check | DNS lookup failure | Individual list marked `{ listed: false }` — not counted as blacklisted |
| Latency | All pings timeout | `checkLatency()` returns `null` — panel shows "Unreachable" |
| Uncaught exception | Any unhandled error | HTTP 500 with generic message, full error logged to console |
