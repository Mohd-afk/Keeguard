<!-- PURPOSE: Defines vulnerability reporting SLA, zero-knowledge scope, and security contacts. -->
# 🛡️ Security Policy — Keeguard (SecureVault)

> **Official OpenSSF-Compliant Security Policy & Vulnerability Disclosure Program**

---

## 📌 Reporting a Vulnerability

We take the security of **Keeguard** seriously. As a Zero-Knowledge password management and credential storage application, security is our primary objective. 

If you believe you have discovered a security vulnerability, side-channel attack vector, memory leak, or zero-knowledge protocol flaw, **please do NOT create a public GitHub issue**.

Instead, please report vulnerabilities privately using one of the following methods:

1. **GitHub Security Advisory (Preferred)**:
   - Navigate to the [Security Tab](../../security/advisories/new) of this repository and click **"Report a vulnerability"**.

2. **Encrypted Security Email**:
   - Email: [`keeguardsupport@gmail.com`](mailto:keeguardsupport@gmail.com)
   - PGP Fingerprint / Key: Available upon request or via standard key servers.

---

## ⏱️ Response & Disclosure Timeline

| Severity Level | Initial Acknowledgment | Remediation & Fix SLA | Public Disclosure |
| :--- | :--- | :--- | :--- |
| **Critical** (Key leakage, Zero-Knowledge breach, Remote Execution) | < 12 Hours | < 48 Hours | Post-patch (+7 days) |
| **High** (Authentication bypass, SQLCipher leak, CSRF/XSS) | < 24 Hours | < 7 Days | Post-patch (+14 days) |
| **Moderate** (Information disclosure, Denial of Service) | < 48 Hours | < 14 Days | Post-patch (+30 days) |
| **Low** (Minor config weakness, non-sensitive UI issue) | < 72 Hours | < 30 Days | Next release |

---

## 🔐 Zero-Knowledge Security Guarantees

Keeguard operates under strict **Zero-Knowledge Architecture**:

1. **Master Password & DEK Integrity**:
   - Master Passwords are **NEVER** transmitted over the network or persisted anywhere.
   - Key derivation uses **Argon2id** (memory-hard parameterization).
   - Vault items are encrypted client-side using **AES-256-GCM** with unique 96-bit IVs per item.

2. **Memory Safety**:
   - Encryption keys held in memory are scrubbed (`src/app/secureMemory.ts`) immediately after operations.
   - Native Android autofill isolates SQLCipher DEKs via **Android Keystore Biometric Authentication**.

3. **Scope & Out of Scope**:
   - **In-Scope**: Master key derivation flaws, AES-GCM IV reuse, IndexedDB/SQLCipher plain-text leaks, Firestore rule bypasses, cross-site script injection via credentials, Capacitor bridge buffer overflows.
   - **Out-of-Scope**: Physical access attacks on unlocked, rooted/jailbroken devices; social engineering attacks against end-users; local browser extensions installed by end-user modifying browser DOM.

---

## 🔄 Supported Versions

Only the latest major/minor releases receive active security patches:

| Version | Supported | Notes |
| :--- | :--- | :--- |
| `v5.x` | ✅ Yes | Current active production release |
| `v4.x` | ⚠️ Security Critical Only | Critical security patches until Q4 2026 |
| `< v4.0` | ❌ No | Unsupported — Users must upgrade to v5.x |

---

*Thank you for helping keep Keeguard and our user community secure!*
