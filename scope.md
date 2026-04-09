# NEXUS — Project Scope, Workflows & Process Flows

**Version:** 2.1.0
**Last Updated:** April 2026
**Author:** Pavan Kumar

---

## Table of Contents

1. [Project Scope](#1-project-scope)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [End-to-End Request Lifecycle](#3-end-to-end-request-lifecycle)
4. [Frontend State Machine](#4-frontend-state-machine)
5. [Backend Intelligence Pipeline](#5-backend-intelligence-pipeline)
6. [Intelligence Module Workflows](#6-intelligence-module-workflows)
7. [Caching Workflow](#7-caching-workflow)
8. [Frontend Scan Workflow](#8-frontend-scan-workflow)
9. [Data Export Workflow](#9-data-export-workflow)
10. [Bulk Scan Workflow](#10-bulk-scan-workflow)
11. [Out of Scope](#11-out-of-scope)

---

## 1. Project Scope

### In Scope

NEXUS provides passive, non-intrusive OSINT reconnaissance against publicly accessible hosts:

- **IP Analysis** — Resolve, reverse-lookup, and geo-locate any public IPv4 address
- **Domain Analysis** — Full DNS record retrieval, WHOIS registration data, subdomain discovery
- **Port Intelligence** — TCP connection testing against 25 standard developer ports (or custom list)
- **HTTP Fingerprinting** — Server identification, security header audit, and automated security grade
- **SSL/TLS Inspection** — Certificate extraction without validation (passive observation)
- **Domain Registration** — Registrar, IANA ID, domain age, expiry countdown, status badges
- **Reputation Check** — DNSBL lookups against 3 public blacklists
- **Network Latency** — TCP-based round-trip time measurement (3-ping average)
- **Data Export** — JSON copy, JSON download, cURL snippet generation

### Out of Scope

| Excluded | Reason |
|----------|--------|
| Private / RFC1918 IP scanning | SSRF risk — blocked by server |
| IPv6 support | Not yet implemented |
| UDP port scanning | Requires raw sockets / elevated privileges |
| Active exploitation or vulnerability testing | Not an OSINT tool's purpose |
| Stored scan history on server | Stateless design — no database |
| User accounts / authentication | Public OSINT tool |
| Real-time streaming / WebSockets | REST-only design |
| Screenshots or page rendering | No headless browser |
| DNSSEC validation | Not implemented |
| IPv6 geolocation | ip-api.com free tier is IPv4 only |
| Traceroute / path analysis | Not implemented |

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT BROWSER                             │
│                                                                     │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────────────┐  │
│  │ Boot Screen │──▶│ Intro Screen │──▶│    Main Application     │  │
│  └─────────────┘   └──────────────┘   │                         │  │
│                                       │  Search Bar             │  │
│                                       │  History Chips          │  │
│                                       │  9-Panel Results Grid   │  │
│                                       │  Export Actions         │  │
│                                       │  System Console         │  │
│                                       └────────────┬────────────┘  │
└────────────────────────────────────────────────────│───────────────┘
                                                     │ HTTP POST
                                                     │ /api/lookup
                                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         server.js (Express)                         │
│                                                                     │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────┐               │
│  │ Health Check │  │   CORS     │  │ Sec Headers  │               │
│  │ /api/health  │  │ Middleware │  │ Middleware   │               │
│  │ /healthz     │  └────────────┘  └──────────────┘               │
│  └──────────────┘                                                   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              POST /api/lookup                                  │  │
│  │                                                               │  │
│  │  Rate Limiter → Input Validate → SSRF Check → Cache Check     │  │
│  │                                                               │  │
│  │            Promise.all (12 parallel lookups)                  │  │
│  │  ┌─────┐ ┌─────┐ ┌──────┐ ┌─────┐ ┌──────┐ ┌──────────┐   │  │
│  │  │ MX  │ │ NS  │ │ TXT  │ │ SOA │ │ Geo  │ │   HTTP   │   │  │
│  │  └──┬──┘ └──┬──┘ └──┬───┘ └──┬──┘ └──┬───┘ └────┬─────┘   │  │
│  │  ┌──┴──┐ ┌──┴──┐ ┌──┴──────┐ ┌──┴──┐ ┌────┴──┐             │  │
│  │  │Ports│ │ SSL │ │  WHOIS  │ │Subs │ │DNSBL  │             │  │
│  │  └──┬──┘ └──┬──┘ └────┬────┘ └──┬──┘ └────┬──┘             │  │
│  │     └───────┴──────────┴─────────┴─────────┘                 │  │
│  │                         │ Aggregate                           │  │
│  │                         ▼                                     │  │
│  │              JSON Response + Cache Store                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────┬────────────────────────────┘
                                         │
             ┌───────────────────────────┼────────────────────────────┐
             │                           │                            │
             ▼                           ▼                            ▼
     ┌───────────────┐         ┌──────────────────┐         ┌────────────────┐
     │  ip-api.com   │         │  DNS Servers     │         │  Target Host   │
     │  (Geo-locate) │         │  (MX/NS/TXT/SOA/ │         │  (Ports/SSL/   │
     └───────────────┘         │   Subdomains/    │         │   HTTP/Latency)│
                               │   DNSBL)         │         └────────────────┘
                               └──────────────────┘
```

---

## 3. End-to-End Request Lifecycle

```
USER TYPES INPUT → CLICKS EXECUTE
         │
         ▼
┌─────────────────────────────────┐
│   CLIENT-SIDE VALIDATION        │
│   validateInput(input)          │
│   - IP octet range check        │
│   - Domain name regex           │
│   - Empty check                 │
└──────────┬──────────────────────┘
           │ FAIL → log warning, stop
           │ PASS ↓
           ▼
┌─────────────────────────────────┐
│   UI STATE: SCANNING            │
│   - Button disabled             │
│   - Progress bar animated       │
│   - All panels cleared          │
│   - Console logs phases 1-4     │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│   POST /api/lookup              │
│   Body: { value, ports }        │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│   SERVER: RATE LIMIT CHECK      │
│   lookupLimiter (15/min/IP)     │
└──────────┬──────────────────────┘
           │ EXCEEDED → HTTP 429
           │ OK ↓
           ▼
┌─────────────────────────────────┐
│   SERVER: INPUT PARSE           │
│   - Trim whitespace             │
│   - Parse custom ports          │
│     (split, parseInt, dedupe,   │
│      max 30, range 1-65535)     │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│   SERVER: CACHE LOOKUP          │
│   Key = "{input}|{ports}"       │
└──────────┬──────────────────────┘
           │ HIT → return + cached:true
           │ MISS ↓
           ▼
┌─────────────────────────────────┐
│   SERVER: INPUT TYPE DETECTION  │
│   isIp(input)?                  │
│   YES → targetIp = input        │
│          isPrivateIp? → 400     │
│          reverse DNS lookup     │
│   NO  → URL parse → hostname    │
│          DNS resolve4 → IP      │
│          isPrivateIp? → 400     │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│   SERVER: PARALLEL LOOKUPS      │
│   Promise.all([                 │
│     resolveMx(hostname),        │
│     resolveTxt(hostname),       │
│     resolveNs(hostname),        │
│     resolveSoa(hostname),       │
│     getGeoInfo(ip),             │
│     getServerHeaders(url),      │
│     scanPorts(ports, ip),       │
│     getSslDetails(hostname),    │
│     getWhois(hostname|ip),      │
│     enumerateSubdomains(host),  │
│     checkReputation(ip),        │
│     checkLatency(ip, port)      │
│   ])                            │
└──────────┬──────────────────────┘
           │ All resolve (errors caught internally)
           ▼
┌─────────────────────────────────┐
│   SERVER: AGGREGATE RESULT      │
│   Assemble full result object   │
│   Store in CACHE (Map)          │
│   res.json(result)              │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│   CLIENT: RENDER RESULTS        │
│   render(data) called           │
│   9 panels populated            │
│   70ms stagger between rows     │
│   History entry saved           │
│   Export buttons enabled        │
└─────────────────────────────────┘
```

---

## 4. Frontend State Machine

```
PAGE LOAD
    │
    ▼
┌───────────────────┐
│   BOOT SCREEN     │  3,700ms
│   - 15 log lines  │
│   - Progress bar  │
└────────┬──────────┘
         │
         ├── localStorage: 'nexus_intro_seen' = true?
         │           │
         │           YES ──────────────────────────┐
         │                                         │
         NO                                        │
         │                                         │
         ▼                                         │
┌───────────────────┐                              │
│   INTRO SCREEN    │  max 10s                     │
│   - Countdown ring│                              │
│   - Feature cards │                              │
│   - Skip button   │                              │
└────────┬──────────┘                              │
         │ (timeout or skip)                       │
         │ sets 'nexus_intro_seen' = true          │
         │                                         │
         └──────────────────────────────┬──────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │   MAIN APP (IDLE)   │
                             │   - All panels idle  │
                             │   - History loaded   │
                             │   - Client IP shown  │
                             │   - Theme restored   │
                             └──────────┬──────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
            User types         History chip          Bulk mode
            + hits Enter       clicked               triggered
                    │                   │                   │
                    └───────────────────┴───────────────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │   SCANNING STATE    │
                             │   - Button disabled  │
                             │   - Bar animating    │
                             │   - Panels cleared   │
                             └──────────┬──────────┘
                                        │
                          ┌─────────────┴─────────────┐
                          │                           │
                          ▼                           ▼
                    API success                  API error
                          │                           │
                          ▼                           ▼
                   render(data)              Show error in rCore
                   Save to history           Log to console
                   Enable exports
                          │
                          ▼
                   RESULTS VISIBLE (IDLE)
                   Ready for next scan
```

---

## 5. Backend Intelligence Pipeline

```
POST /api/lookup received
         │
         ├─[MIDDLEWARE STACK]──────────────────────────────────────────
         │  1. Health routes (skip all middleware)
         │  2. CORS headers
         │  3. express.json() — parse body
         │  4. Security headers (HSTS, CSP, X-Frame, etc.)
         │  5. globalLimiter (500 req / 15 min)
         │  6. Static file serving (public/)
         │  7. lookupLimiter (15 req / 60s) — /api/lookup only
         │─────────────────────────────────────────────────────────────
         │
         ├─[VALIDATION]────────────────────────────────────────────────
         │  input = req.body.value.trim()
         │  if !input → 400
         │
         │  ports = req.body.ports
         │  if ports → parse → deduplicate → cap at 30
         │  else → use PORTS_TO_SCAN (25 defaults)
         │─────────────────────────────────────────────────────────────
         │
         ├─[CACHE CHECK]───────────────────────────────────────────────
         │  cacheKey = `${input}|${ports.join(',')}`
         │  hit → return early with cached:true
         │─────────────────────────────────────────────────────────────
         │
         ├─[INPUT CLASSIFICATION]──────────────────────────────────────
         │  isIp(input)?
         │  ├── YES (IP mode)
         │  │    isPrivateIp? → 400
         │  │    targetIp = input
         │  │    dns.reverse(input) → result.hostname, reverseHostnames
         │  │
         │  └── NO (Domain mode)
         │       URL parse → hostname, protocol
         │       dns.resolve4(hostname) → addresses[]
         │       if empty → 400 (unresolvable)
         │       isPrivateIp(addresses[0]) → 400 (SSRF)
         │       targetIp = addresses[0]
         │─────────────────────────────────────────────────────────────
         │
         ├─[PARALLEL INTELLIGENCE — Promise.all]───────────────────────
         │
         │  ┌─ dns.resolveMx(hostname) ──────────────── MX records
         │  ├─ dns.resolveTxt(hostname) ─────────────── TXT records (flat)
         │  ├─ dns.resolveNs(hostname) ──────────────── NS records
         │  ├─ dns.resolveSoa(hostname) [domain only] ─ SOA record
         │  ├─ getGeoInfo(targetIp) ─────────────────── ip-api.com GET
         │  ├─ getServerHeaders(url) [domain only] ──── HEAD request, 4s timeout
         │  ├─ Promise.all(ports.map(checkPort)) ─────── TCP sockets, 1.5s each
         │  ├─ getSslDetails(hostname) [domain only] ─── TLS handshake, 2.5s
         │  ├─ getWhois(hostname|ip) ───────────────────  port 43 query, 5s
         │  ├─ enumerateSubdomains(hostname) [domain] ─── 30 A-record lookups
         │  ├─ checkReputation(targetIp) ──────────────── 3 DNSBL lookups
         │  └─ checkLatency(targetIp, port) ─────────────  3 TCP pings, 1.5s each
         │
         │  All errors within each function are caught internally.
         │  A failure in one module does not prevent others from completing.
         │─────────────────────────────────────────────────────────────
         │
         ├─[AGGREGATE]─────────────────────────────────────────────────
         │  Build result object with all 12 module outputs
         │  Map port results: filter nulls, add service names
         │  Store to CACHE
         │  res.json(result)
         │─────────────────────────────────────────────────────────────
         │
         └─[ERROR HANDLING]────────────────────────────────────────────
            catch(err) → console.error (internal)
            res.status(500).json({ error: "generic message" })
```

---

## 6. Intelligence Module Workflows

### 6.1 Port Scanner

```
For each port in PORTS_TO_USE (up to 30):
    Create net.Socket
    Set 1,500ms timeout
    Attempt TCP connect(port, targetIp)

    ├── connect event fires → port OPEN  → resolve(port)
    ├── timeout event fires → port CLOSED → resolve(null)
    └── error event fires  → port CLOSED → resolve(null)

All port checks run concurrently via Promise.all
Results: filter(null) → map to { port, service: PORT_NAMES[port] || 'Unknown' }
```

### 6.2 SSL/TLS Inspector

```
tls.connect({
    host: hostname,
    port: 443 (or first custom port),
    servername: hostname,    ← SNI
    rejectUnauthorized: false ← passive OSINT mode
})
    │
    ├── connect event →
    │     getPeerCertificate()
    │     getProtocol()
    │     Extract: valid_from, valid_to, issuer.O/CN, subject.CN
    │     Compute: daysRemaining = floor((validTo - now) / 86400000)
    │     socket.end()
    │     resolve(certObject)
    │
    ├── timeout (2,500ms) → socket.destroy() → resolve(null)
    └── error → socket.destroy() → resolve(null)
```

### 6.3 WHOIS Resolver

```
whois(target, { follow: 2, timeout: 5000 })
    │
    ├── Parse raw WHOIS response as JSON (whois-json handles this)
    │
    ├── Extract via pick() helper (tries multiple key variants):
    │     registrar       ← 'registrar' | 'Registrar' | 'Sponsoring Registrar'
    │     registrarUrl    ← 'registrarUrl' | 'Registrar URL'
    │     registrarIanaId ← 'registrarIanaId' | 'Registrar IANA ID'
    │     creationDate    ← 'creationDate' | 'Creation Date'
    │     updatedDate     ← 'updatedDate' | 'Updated Date' | 'Last Updated'
    │     expirationDate  ← 6 key variants tried
    │     rawStatus       ← 'domainStatus' | 'Domain Status' | 'Status'
    │
    ├── Parse status:
    │     Normalize to array → join → split on ICANN URLs / commas
    │     Strip remaining URLs → trim → filter empty → slice(0,5)
    │
    ├── Compute:
    │     domainAgeDays  = floor((now - new Date(creationDate)) / 86400000)
    │     daysUntilExpiry = floor((new Date(expirationDate) - now) / 86400000)
    │
    └── Return structured WhoisResult object
```

### 6.4 Subdomain Enumeration

```
COMMON_SUBDOMAINS (30 prefixes)
    │
    Split into chunks of 10
    │
    For each chunk (sequential — DNS stability):
        Promise.all(chunk.map(prefix =>
            dns.resolve4(`${prefix}.${domain}`)
                → success: push `${prefix}.${domain}` to found[]
                → NXDOMAIN: ignore
        ))
    │
    Return found[] (may be empty)
```

### 6.5 Reputation Check

```
IP: a.b.c.d → reversed: d.c.b.a

For each DNSBL list (parallel):
    dns.resolve4(`d.c.b.a.{list}`)
    ├── NXDOMAIN     → { list, listed: false }
    └── Any A record → { list, listed: true }

Lists: zen.spamhaus.org | b.barracudacentral.org | cbl.abuseat.org
```

### 6.6 TCP Latency

```
For i = 0 to 2 (3 pings):
    start = Date.now()
    TCP connect to (targetIp, port)
    ├── connect → record (Date.now() - start) → socket.destroy()
    ├── timeout (1,500ms) → record null
    └── error → record null

avg = round(sum(times) / times.length)
Return { times: [t1, t2, t3], avg }
Return null if all pings failed
```

---

## 7. Caching Workflow

```
Request: input="github.com", ports=[80,443]
    │
    cacheKey = "github.com|80,443"
    │
    ▼
CACHE.get(cacheKey)
    │
    ├── undefined → MISS → run full scan → CACHE.set(key, {data, ts:now})
    │                                       → res.json(data)
    │
    └── exists
         │
         ├── (now - entry.ts) > 180,000ms → STALE → CACHE.delete(key) → MISS
         │
         └── (now - entry.ts) ≤ 180,000ms → HIT
                  │
                  res.json({ ...entry.data, cached: true })
                  console.log("[CACHE] Hit for: github.com")

Cache eviction (on CACHE.size >= 200):
    Sort all entries by ts ascending → delete entries[0] (oldest)
```

---

## 8. Frontend Scan Workflow

```
run() called
    │
    ▼
input = document.getElementById('qi').value.trim()
    │
    ├── empty → return (no-op)
    │
    ▼
validateInput(input)
    │
    ├── error string → log(error, 'w') → qi.focus() → return
    │
    ▼
UI: btn.disabled=true, btn.text='SCANNING...'
    sbar.classList.add('on')        ← progress bar animates
    grid.classList.add('scanning')  ← panel headers pulse
    Clear all 9 panel contents
    Disable export buttons

log('Starting intelligence scan for: {input}', 'i')
log('Phase 1: DNS & Geo-location analysis...')

    │
    ▼
fetch('POST /api/lookup', { value: input, ports: customPorts })
    │
    ├── HTTP 429 → throw Error('Rate limit reached. Wait 1 minute.')
    │
log('Phase 2: Port scanning & Service detection...')
log('Phase 3: SSL/TLS & WHOIS verification...')
log('Phase 4: Subdomain & Reputation audit...')

    │
    ▼
data = await res.json()
    │
    ├── data.error → throw Error(data.error)
    │
    ▼
log('Scan complete [CACHED?] — N port(s) found · Xms latency', 'i')
if any reputation listed → log('Alert: blacklist!', 'e')

last = data                          ← stored for export
Enable export buttons (copy/download/curl)
updateActionStatus()                 ← "DATA READY"
render(data)                         ← populate all panels
saveH({ i:input, ip, hostname, cc }) ← localStorage history
renderH()                            ← re-render chips

    ├── catch(e) →
    │    log(e.message, 'e')
    │    rCore shows red error state
    │
    └── finally →
         btn.disabled=false, btn.text='EXECUTE'
         sbar.classList.remove('on')
         grid.classList.remove('scanning')
```

---

## 9. Data Export Workflow

### Copy JSON

```
btnCopy.click
    │
    last !== null?
    │
    j = JSON.stringify(last, null, 2)
    │
    ├── navigator.clipboard.writeText(j)
    │     success → log('JSON copied') → showFeedback('✓ COPIED', success)
    │     fail    → textarea fallback → execCommand('copy')
    │                                → showFeedback('✓ COPIED', success)
    └── showFeedback fades after 2,200ms
```

### Download JSON

```
btnExport.click
    │
    j = JSON.stringify(last, null, 2)
    filename = `nexus-tool-{hostname|ip}-{Date.now()}.json`
    │
    Blob([j], { type: 'application/json' })
    URL.createObjectURL(blob)
    <a href=url download=filename>.click()
    URL.revokeObjectURL(url)
    │
    log('Exported: {filename}')
    showFeedback('✓ SAVED', success)
```

### Copy cURL

```
btnCurl.click
    │
    target = last.hostname || last.ip
    url = 'https://' + target
    │
    curl = `curl -I -X GET "{url}" \
      -H "User-Agent: Mozilla/5.0 (Nexus-Tool OSINT/2.0)"`
    │
    navigator.clipboard.writeText(curl)
    showFeedback('✓ COPIED', success)
```

---

## 10. Bulk Scan Workflow

```
BULK MODE button clicked
    │
    prompt() → comma-separated targets string
    │
    ├── null / empty → return
    │
    targets = input.split(',').map(trim).filter(Boolean)
    log(`Starting Bulk Scan for ${n} targets...`, 'w')

    i = 0
    delay = 4,500ms   ← (60s / 15 req = 4s minimum, +0.5s buffer)

    next():
        ├── i >= targets.length → log('Bulk scan complete!', 'i') → done
        │
        qi.value = targets[i]
        log(`Bulk: Scanning [i+1/n] -> {target}`, 'i')
        │
        run().then(() =>
            i++
            i < targets.length → setTimeout(next, 4500)
            else               → next()    ← triggers done
        )
```

---

## 11. Out of Scope

The following items are explicitly **not** part of the current implementation and would require significant architectural changes:

| Feature | Why Not Included |
|---------|-----------------|
| **Database / persistent storage** | Stateless design by choice; Render free tier has no disk persistence |
| **User authentication** | Public OSINT tool; no personal data stored |
| **IPv6 scanning** | ip-api.com free tier does not support IPv6 geolocation |
| **UDP port scanning** | Requires OS-level raw socket access; not safe in cloud environments |
| **Screenshot capture** | Requires headless browser (Puppeteer); adds ~150MB dependency |
| **Historical scan comparison** | No database to store past results |
| **Real-time progress via WebSockets** | Current architecture uses single blocking HTTP request |
| **DNSSEC validation** | `dns.promises` does not expose DNSSEC chain data |
| **Certificate chain inspection** | Only leaf certificate extracted via `tls.connect` |
| **Reverse IP lookup (other domains on IP)** | Requires third-party API (ViewDNS, etc.) |
| **API key system** | Rate limiting deemed sufficient for public tool |
| **Automated tests** | `npm test` is placeholder; no test suite exists |
| **CI/CD pipeline** | Render auto-deploys from `main` branch — no GitHub Actions needed currently |
