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

      const elements = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea, [role="combobox"]'
      );

      let index = 1;
      elements.forEach(el => {
        if (el.disabled) return;

        // Check computed style / bounding rect instead of offsetParent (which breaks in fixed modals!)
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const label = extractFieldLabel(el, index++);
        if (!label) return;

        let value = '';
        if (el.tagName === 'SELECT') {
          value = el.options[el.selectedIndex]?.text?.trim() || el.value || '';
        } else {
          value = (el.value || '').trim();
        }

        const key = label.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        captured.push({ label, value, sensitive: el.type === 'password' });
      });

      sendResponse({ success: true, fields: captured, url: window.location.href });
      return true;
    }

    if ((message.type === 'AUTOFILL_CREDENTIAL' || message.type === 'AUTOFILL_PROFILE') && (message.credential || message.profile)) {
      const data = message.credential || message.profile;
      let count = 0;
      const forms = window.scanPageForms ? window.scanPageForms() : [];
      if (forms && forms.length > 0) {
        forms.forEach(form => {
          count += (window.fillFormFields ? window.fillFormFields(form, data) : 0);
        });
      }
      if (count === 0 && window.fillAllPageFields) {
        count = window.fillAllPageFields(data, document);
      }

      // Fallback: direct input fill if scanPageForms missed elements
      if (count === 0 && data.password) {
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        passwordInputs.forEach(pwdInput => {
          if (window.setFieldValue) {
            window.setFieldValue(pwdInput, data.password || '');
          } else {
            pwdInput.value = data.password || '';
            pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          count++;
          const formEl = pwdInput.closest('form') || document.body;
          const userInputs = formEl.querySelectorAll('input[type="email"], input[type="text"], input:not([type])');
          for (const uInput of userInputs) {
            if (uInput !== pwdInput && uInput.offsetParent !== null) {
              if (window.setFieldValue) {
                window.setFieldValue(uInput, data.username || '');
              } else {
                uInput.value = data.username || '';
                uInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
              break;
            }
          }
        });
      }

      sendResponse({ success: count > 0, filledCount: count });
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
