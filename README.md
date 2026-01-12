# 🌐 NEXUS | Network Intelligence Tool

![Project Status](https://img.shields.io/badge/status-active-success)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tech Stack](https://img.shields.io/badge/stack-MERN%20Logic-cyan)

**NEXUS** is a full-stack OSINT (Open Source Intelligence) tool designed to perform deep analysis on IP addresses and domain names. It features a "Cyber Command Centre" interface with a responsive, sci-fi aesthetic, powered by a robust Node.js backend that aggregates DNS, Geo-location, and Server fingerprinting data in real-time.

---

## ✨ Key Features

### 🔍 Intelligence Capabilities
* **IP & Domain Resolution:** Instantly resolves Hostnames to IPs and performs Reverse DNS lookups.
* **Geo-Location Tracking:** Pinpoints physical location (Country, City, Coordinates) and ISP details.
* **Deep DNS Analysis:** Fetches complex records including **MX** (Mail Exchange), **NS** (Name Servers), and **TXT** (Verification/SPF).
* **Server Fingerprinting:** Analyses HTTP headers to detect server software (Nginx/Apache), technology stacks, and open ports.

### 🖥️ UI/UX Experience
* **Cyber-Security Aesthetic:** Glassmorphism, neon accents, and scanning animations.
* **Interactive Visuals:** HTML5 Canvas background with particle network animations.
* **System Console:** Real-time logging of backend operations in a terminal-style output.
* **Fully Responsive:** Adaptive grid layout that scales seamlessly from Desktop to Mobile.

---

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3 (Variables, Grid, Flexbox), Vanilla JavaScript (ES6+).
* **Backend:** Node.js, Express.js.
* **APIs & Libraries:**
    * `dns.promises` (Native Node.js DNS module).
    * `ip-api.com` (Geo-location data).
    * `cors` (Cross-Origin Resource Sharing).

---

## 🚀 Getting Started

Follow these steps to run NEXUS locally.

### Prerequisites
* **Node.js** (v14 or higher)
* **npm** (Node Package Manager)

### Installation

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/yourusername/nexus-tool.git](https://github.com/yourusername/nexus-tool.git)
    cd nexus-tool
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Start the Server**
    ```bash
    node server.js
    ```

4.  **Access the Interface**
    Open your browser and navigate to:
    `http://localhost:5000`

---

## 📂 Project Structure

```text
nexus-tool/
├── public/              # Frontend Assets
│   └── index.html       # Single Page Application (UI + Logic)
├── server.js            # Backend Entry Point (API + Static Serving)
├── package.json         # Project Metadata & Dependencies
└── README.md            # Documentation
