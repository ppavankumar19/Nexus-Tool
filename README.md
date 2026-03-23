# 🌐 NEXUS | Network Intelligence Tool

[![Render](https://img.shields.io/badge/Render-Deployed-success)](https://nexus-tool.19062002.xyz)
![Status](https://img.shields.io/badge/status-active-success)
![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![Stack](https://img.shields.io/badge/stack-Node.js-cyan)

**🔗 Live Demo:** [https://nexus-tool.19062002.xyz](https://nexus-tool.19062002.xyz)

---

**NEXUS** is a full-stack OSINT (Open Source Intelligence) tool for deep analysis of IP addresses and domain names. It features an animated "Cyber Command Centre" interface with a terminal boot sequence, responsive grid layout, and a Node.js backend that aggregates DNS, Geo-location, Port Scanning, and Server fingerprinting data in real-time.

---

## ✨ Key Features (V2.0)

### 🔍 Intelligence Capabilities
* **SSL/TLS Deep-Dive** — Extract certificate validity, issuer, subject, and protocol details. Displays "Days Remaining" with color-coded warnings.
* **WHOIS Integration** — Domain registration details including Registrar, Creation, and Expiry dates.
* **Subdomain Enumeration** — Parallel discovery of common subdomains (api, dev, staging, etc.).
* **Security Headers Audit** — Automated "Security Grade" (A+ to F) based on HSTS, CSP, X-Frame-Options, and more.
* **Reputation & Blacklist Check** — Real-time checks against DNSBLs (Spamhaus, Barracuda) to detect malicious IPs.
* **Network Latency (TCP Ping)** — Measured average response time with visual performance bar.
* **Custom Port Scanning** — Scan the default 16 ports or provide your own custom port list (e.g., `80,443,8080`).
* **Geo-Location Tracking** — Country, City, ISP, ASN, Coordinates (Google Maps integration), and Timezone.
* **Deep DNS Analysis** — MX, NS, and TXT (SPF / DMARC) records.

### 🖥️ UI / UX
* **Dual Themes** — Switch between **Cyber** (Neon Pink/Cyan) and **Matrix** (Retro Green Terminal) modes.
* **Bulk Lookup Mode** — Scan multiple targets sequentially with built-in rate-limit protection.
* **cURL Snippet Generator** — One-click copy of CLI-ready cURL commands for the target.
* **Animated Boot Screen** — Terminal-style startup sequence with boot log and progress bar.
* **Fully Responsive** — Optimized for mobile, tablet, and desktop with a 1-column stack on small screens.
* **Copy / Export JSON** — One-click copy to clipboard or download the full scan as a `.json` file.
* **Lookup History** — Last 8 scans stored in `localStorage` for instant re-scanning.
* **System Console** — Real-time color-coded event log tracking system activity.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3 (Grid, Variables), Vanilla JS (ES6+) |
| Backend | Node.js ≥18, Express v5 |
| Security | express-rate-limit (15 lookups/min, 200 global/15min) |
| DNS | `dns.promises` — native Node module |
| WHOIS | `whois-json` |
| Port Scan | `net` — native Node TCP sockets (Parallel) |
| SSL/TLS | `tls` — native Node module |
| Geo | ip-api.com free tier |

---

## 🖥️ Frontend Flow (V2.0)

### 1. Boot Screen (≈3.7 s)
Terminal-style boot animation initializing modules and verifying network sockets.

### 2. Intro Screen (10 s countdown)
Overview of capabilities with an auto-advancing countdown (skippable via Enter/Space).

### 3. Main App — Results Grid
Results are rendered across a 9-panel dynamic grid:
   ┌────────────────┬────────────────┐
   │  CORE_METRICS  │  GEO_LOCATION  │
   ├────────────────┴────────────────┤
   │          PORT_SCAN              │
   ├────────────────┬────────────────┤
   │  DNS_RECORDS   │  SUBDOMAINS    │
   ├────────────────┼────────────────┤
   │  HTTP_INTEL    │  SSL_TLS       │
   ├────────────────┼────────────────┤
   │  WHOIS_DATA    │  NETWORK_LAT   │
   └────────────────┴────────────────┘

**Responsive layout:**
- **Desktop (≥769 px)** — Multi-column CSS Grid.
- **Mobile (≤768 px)** — 1-column stack (all panels full-width).
- **Small Phone (≤480 px)** — Optimized padding, stacked search row, and vertical action cards.

---

## ⚙️ Backend Flow

```
POST /api/lookup  { "value": "input", "ports": "80,443" }
    │
    ├─ Parallel Execution (Promise.all):
         ├─ DNS Records (MX, TXT, NS)
         ├─ Geo-location (ip-api)
         ├─ HTTP Fingerprinting (Security Headers)
         ├─ Port Scanning (Parallel TCP sockets)
         ├─ SSL/TLS Handshake (Cert Details)
         ├─ WHOIS Query (Registrar Data)
         ├─ Subdomain Brute-force (Parallel A-records)
         ├─ Reputation Check (DNSBLs)
         └─ TCP Latency (Simulated Ping)
    │
    └─ Aggregated JSON response
```

---

## 🚀 Getting Started

### Installation

**1. Clone & Install**
```bash
git clone https://github.com/ppavankumar19/Nexus-Tool.git
cd Nexus-Tool
npm install
```

**2. Start Server**
```bash
# Production
npm start

# Development
npm run dev
```

---

## 🔌 API Reference

### `POST /api/lookup`
Performs a full intelligence scan.

**Request Body:**
```json
{ 
  "value": "github.com",
  "ports": "80,443,8080" 
}
```

**Partial Response (New V2 Fields):**
```json
{
  "ssl": {
    "issuer": "DigiCert Inc",
    "validTo": "2026-03-15T23:59:59.000Z",
    "daysRemaining": 352,
    "protocol": "TLSv1.3"
  },
  "whois": {
    "registrar": "MarkMonitor, Inc.",
    "expirationDate": "2026-10-09T18:20:50Z"
  },
  "subdomains": ["www.github.com", "api.github.com"],
  "reputation": [{ "list": "zen.spamhaus.org", "listed": false }],
  "latency": { "avg": 42, "times": [40, 45, 41] }
}
```

---

**Built with 💻 and ☕ by Pavan Kumar**
