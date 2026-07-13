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
