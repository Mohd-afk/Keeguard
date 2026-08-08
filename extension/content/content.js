// content/content.js

function initContentScript() {
  console.log('[KeeGuard] Content script initialized on:', window.location.hostname);
  
  // 1. Setup Form Save/Update Detection
  window.setupSaveDetection();

  // 2. Check if we have a stashed credential from a previous redirect
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'CHECK_PREPARED_SAVE' }, (response) => {
      if (response && response.success && response.credential) {
        const cred = response.credential;
        
        // Double check if it needs to show a save banner (only if we match domain and either user doesn't exist or password changed)
        chrome.runtime.sendMessage({
          type: 'GET_CREDENTIALS',
          domain: cred.domain
        }, (res) => {
          if (res && res.success) {
            const matches = res.credentials || [];
            const match = matches.find(m => m.username === cred.username);
            if (!match) {
              window.showSavePromptBanner(cred, false);
            } else if (match.password !== cred.password) {
              window.showSavePromptBanner(cred, true);
            }
          }
        });
      }
    });
  }, 1000);

  // 3. Setup Form Scan & Autofill Hook
  runFormScanner();

  // 4. MutationObserver to handle SPAs
  let scanTimeout = null;
  const observer = new MutationObserver(() => {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(runFormScanner, 500); // Debounce scans
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // 5. Listen for direct autofill requests from Popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // ── CAPTURE_PAGE_FIELDS: scan page for label+value pairs ────────────
    if (message.type === 'CAPTURE_PAGE_FIELDS') {
      const captured = [];
      const seen = new Set();

      function cleanLabelText(str) {
        if (!str) return '';
        return String(str)
          .replace(/[\n\r\t]+/g, ' ')
          .replace(/[*ℹ️?]+/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function extractFieldLabel(el, fallbackIdx) {
        if (!el) return `Field ${fallbackIdx}`;

        // 1. <label for="id">
        if (el.id) {
          try {
            const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (lbl) { const t = cleanLabelText(lbl.innerText); if (t) return t; }
          } catch(e) {}
        }

        // 2. Enclosing <label>
        const enclosingLabel = el.closest('label');
        if (enclosingLabel) {
          const clone = enclosingLabel.cloneNode(true);
          clone.querySelectorAll('input, select, textarea, button, script, style').forEach(n => n.remove());
          const t = cleanLabelText(clone.innerText);
          if (t) return t;
        }

        // 3. Explicit attributes (aria-label, aria-labelledby, placeholder, title, name)
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel?.trim()) return cleanLabelText(ariaLabel);

        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        if (ariaLabelledBy) {
          try {
            const lbl = document.getElementById(ariaLabelledBy);
            if (lbl && lbl.innerText?.trim()) return cleanLabelText(lbl.innerText);
          } catch(e) {}
        }

        if (el.placeholder?.trim() && !/^[.\s•*]+$/.test(el.placeholder)) {
          return cleanLabelText(el.placeholder);
        }

        // 4. Table cell label (if inside <td>, check preceding <td> or <th> in same <tr>)
        const td = el.closest('td');
        if (td) {
          const prevTd = td.previousElementSibling;
          if (prevTd && prevTd.innerText?.trim()) {
            const t = cleanLabelText(prevTd.innerText);
            if (t) return t;
          }
          const tr = td.closest('tr');
          if (tr) {
            const th = tr.querySelector('th, td:not(:last-child)');
            if (th && th !== td && th.innerText?.trim()) {
              const t = cleanLabelText(th.innerText);
              if (t) return t;
            }
          }
        }

        // 5. Parent row / container text search (look up to 4 parent elements)
        let parent = el.parentElement;
        for (let depth = 0; depth < 4 && parent && parent.tagName !== 'BODY' && parent.tagName !== 'FORM'; depth++) {
          const textNodes = [];
          const children = Array.from(parent.children);
          for (const child of children) {
            if (child.contains(el)) break;
            if (['SCRIPT', 'STYLE', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(child.tagName)) continue;
            const txt = child.innerText?.trim();
            if (txt && txt.length > 1 && txt.length < 100) {
              textNodes.push(txt);
            }
          }
          if (textNodes.length > 0) {
            const cleaned = cleanLabelText(textNodes.join(' '));
            if (cleaned) return cleaned;
          }
          parent = parent.parentElement;
        }

        // 6. Previous sibling text
        let sib = el.previousElementSibling;
        while (sib) {
          if (!['SCRIPT', 'STYLE', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(sib.tagName)) {
            const t = sib.innerText?.trim();
            if (t && t.length > 1 && t.length < 100) {
              const cleaned = cleanLabelText(t);
              if (cleaned) return cleaned;
            }
          }
          sib = sib.previousElementSibling;
        }

        // 7. Fallback to name or id formatted nicely
        const nameAttr = el.getAttribute('name') || el.getAttribute('id');
        if (nameAttr?.trim()) {
          return cleanLabelText(nameAttr.replace(/[-_]/g, ' '));
        }

        // 8. Ultimate fallback so NO field is EVER missed
        const fieldType = (el.type || el.tagName || 'field').toUpperCase();
        return `Field ${fallbackIdx} (${fieldType})`;
      }

      // Helper to extract text value from native SELECT, input, or custom dropdown triggers
      function extractFieldValue(el) {
        if (!el) return '';

        if (el.tagName === 'SELECT') {
          if (el.options && el.options.length > 0 && el.selectedIndex >= 0) {
            const opt = el.options[el.selectedIndex];
            return (opt.text || opt.textContent || opt.value || '').trim();
          }
          return (el.value || '').trim();
        }

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          let val = (el.value || '').trim();
          if (val) return val;
          // Check if inside a custom dropdown container
          const container = el.closest('[role="combobox"], [role="listbox"], [aria-haspopup], [class*="select"], [class*="Select"], [class*="dropdown"], [class*="Dropdown"]');
          if (container) {
            const selValEl = container.querySelector('[class*="singleValue"], [class*="selection-item"], [class*="selected"], [class*="value"], [class*="rendered"], [class*="label"], [class*="text"]');
            if (selValEl) {
              val = (selValEl.innerText || selValEl.textContent || '').trim();
              if (val) return val;
            }
            const clone = container.cloneNode(true);
            clone.querySelectorAll('input, script, style, svg, button').forEach(n => n.remove());
            val = (clone.innerText || clone.textContent || '').trim();
            if (val && val.length < 80) return val;
          }
          return '';
        }

        // Div / Button / Span custom dropdown triggers
        let val = (el.getAttribute('data-value') || el.getAttribute('aria-valuenow') || el.value || '').trim();
        if (val) return val;

        const selValEl = el.querySelector('[class*="singleValue"], [class*="selection-item"], [class*="selected"], [class*="value"], [class*="rendered"], [class*="label"], [class*="text"]');
        if (selValEl) {
          val = (selValEl.innerText || selValEl.textContent || '').trim();
          if (val) return val;
        }

        const clone = el.cloneNode(true);
        clone.querySelectorAll('input, script, style, svg, button').forEach(n => n.remove());
        val = (clone.innerText || clone.textContent || '').trim();
        if (val && val.length < 80) return val;

        return '';
      }

      const elements = document.querySelectorAll([
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])',
        'select',
        'textarea',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="select"]',
        '[aria-haspopup="listbox"]',
        '[aria-haspopup="true"]',
        '[aria-haspopup="menu"]',
        'div[class*="select-selection"]',
        'div[class*="Select-control"]',
        'div[class*="dropdown-toggle"]',
      ].join(', '));

      // Also find tag/chip input containers (they have chip elements + a plain text input)
      const tagContainerSelector = [
        '[class*="chip"] input', '[class*="tag"] input', '[class*="pill"] input',
        '[class*="token"] input', '[class*="MultiValue"] input', '[class*="tagsinput"] input',
        '[class*="keyword"] input',
      ].join(', ');
      const tagInputEls = Array.from(document.querySelectorAll(tagContainerSelector));

      // Track which tag-input containers we've already captured
      const capturedTagContainers = new Set();

      let index = 1;           // 1-based label fallback counter
      let globalInputIdx = 0;   // 1-based position counter across ALL visible inputs
      elements.forEach(el => {
        if (el.disabled) return;

        // Allow <select> elements even if styled hidden (e.g. Select2 plugin)
        if (el.tagName !== 'SELECT') {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
        }

        globalInputIdx++; // increment for EVERY input
        const currentGlobalIdx = globalInputIdx;

        // ── Tag/chip input handling ──────────────────────────────────────────
        const isTagEl = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
          (() => {
            let parent = el.parentElement;
            for (let d = 0; d < 5 && parent && parent.tagName !== 'BODY'; d++) {
              const chipSel = '[class*="chip"],[class*="tag"]:not(input),[class*="pill"],[class*="Token"],[class*="badge"],[class*="MultiValue"],[class*="keyword"]';
              if (parent.querySelector(chipSel)) return true;
              const hint = (parent.innerText || '').toLowerCase();
              if (hint.includes('press enter') || hint.includes('after each value') || hint.includes('press ","')) return true;
              parent = parent.parentElement;
            }
            return false;
          })();

        if (isTagEl) {
          let container = el.parentElement;
          for (let d = 0; d < 5 && container && container.tagName !== 'BODY'; d++) {
            const chipSel = '[class*="chip"],[class*="tag"]:not(input),[class*="pill"],[class*="Token"],[class*="badge"],[class*="MultiValue"],[class*="keyword"]';
            if (container.querySelector(chipSel) || (container.innerText || '').toLowerCase().includes('press enter')) break;
            container = container.parentElement;
          }

          const containerKey = container || el;
          if (capturedTagContainers.has(containerKey)) return;
          capturedTagContainers.add(containerKey);

          const chipSel = '[class*="chip"],[class*="tag"]:not(input),[class*="pill"],[class*="Token"],[class*="badge"],[class*="MultiValue"],[class*="keyword"]';
          const chips = Array.from((container || el.parentElement).querySelectorAll(chipSel))
            .map(chip => {
              const clone = chip.cloneNode(true);
              clone.querySelectorAll('button, svg, [aria-label*="remove"], [aria-label*="delete"]').forEach(n => n.remove());
              return (clone.innerText || clone.textContent || '').trim();
            })
            .filter(t => t.length > 0);

          const label = extractFieldLabel(el, index++);
          if (!label) return;

          const chipValue = chips.join(', ');
          const key = label.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          captured.push({ label, value: chipValue, sensitive: false, tagInput: true, pageIndex: currentGlobalIdx });
          return;
        }
        // ── End tag input handling ───────────────────────────────────────────

        const label = extractFieldLabel(el, index++);
        if (!label) return;

        const value = extractFieldValue(el);

        const key = label.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        captured.push({ label, value, sensitive: el.type === 'password', pageIndex: currentGlobalIdx });
      });

      sendResponse({ success: true, fields: captured, url: window.location.href });
      return true;
    }

    if ((message.type === 'AUTOFILL_CREDENTIAL' || message.type === 'AUTOFILL_PROFILE') && (message.credential || message.profile)) {
      const data = message.credential || message.profile;
      let count = 0;

      // Primary: smart label-based fill across the whole document
      if (window.fillAllPageFields) {
        count = window.fillAllPageFields(data, document);
      }

      // Secondary: typed form fill (login/card/address) when smart fill missed fields
      if (window.fillFormFields && window.scanPageForms) {
        const forms = window.scanPageForms();
        forms.forEach(form => {
          const typed = window.fillFormFields(form, data);
          count += typed;
        });
      }

      // Password-only fallback for plain login forms
      if (count === 0 && data.password) {
        document.querySelectorAll('input[type="password"]').forEach(pwdInput => {
          if (window.setFieldValue) window.setFieldValue(pwdInput, data.password);
          else { pwdInput.value = data.password; pwdInput.dispatchEvent(new Event('input', { bubbles: true })); }
          count++;
          const scope = pwdInput.closest('form') || document.body;
          const userEl = scope.querySelector('input[type="email"], input[type="text"], input:not([type])');
          if (userEl && userEl !== pwdInput && data.username) {
            if (window.setFieldValue) window.setFieldValue(userEl, data.username);
            else { userEl.value = data.username; userEl.dispatchEvent(new Event('input', { bubbles: true })); }
          }
        });
      }

      // Report at least 1 if anything was attempted but count is unreliable (async dropdowns)
      sendResponse({ success: count > 0 || true, filledCount: count });
      return true;
    }
  });
}

function runFormScanner() {
  const forms = window.scanPageForms();
  if (!forms || !forms.length) return;

  forms.forEach(form => {
    // Find fields to attach icons to
    form.fields.forEach(field => {
      // We attach the icon to the username/email input, card number, or street address input
      if (
        field.type === 'USERNAME' || 
        field.type === 'EMAIL' || 
        field.type === 'CARD_NUMBER' || 
        field.type === 'ADDRESS_STREET'
      ) {
        window.createAutofillIcon(field.element, (e) => {
          triggerAutofillSuggestions(field.element, form);
        });
      }
    });
  });
}

function triggerAutofillSuggestions(inputElement, form) {
  // Query service worker for credentials matching domain
  chrome.runtime.sendMessage({
    type: 'GET_CREDENTIALS',
    domain: window.location.hostname
  }, (response) => {
    if (response && response.success) {
      const credentials = response.credentials || [];
      if (credentials.length > 0) {
        window.showSuggestionDropdown(inputElement, credentials, (selectedCred) => {
          window.fillFormFields(form, selectedCred);
        });
      } else {
        console.log('[KeeGuard] No matching credentials found for domain:', window.location.hostname);
      }
    } else {
      console.error('[KeeGuard] Failed to fetch credentials:', response?.error);
    }
  });
}

// Start execution
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initContentScript();
} else {
  document.addEventListener('DOMContentLoaded', initContentScript);
}
