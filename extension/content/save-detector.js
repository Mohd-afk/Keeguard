// content/save-detector.js

let lastEnteredUsername = '';
let lastEnteredPassword = '';
let lastSubmissionTime = 0;

function setupSaveDetection() {
  // Track typed values
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.tagName !== 'INPUT') return;

    const type = window.classifyField(el);
    if (type === 'USERNAME' || type === 'EMAIL') {
      lastEnteredUsername = el.value.trim();
    } else if (type === 'PASSWORD' || type === 'NEW_PASSWORD') {
      lastEnteredPassword = el.value;
    }
  });

  // Proactively stash credentials in background when fields lose focus (to handle fast page redirects)
  document.addEventListener('blur', (e) => {
    const el = e.target;
    if (el.tagName !== 'INPUT') return;

    if (lastEnteredUsername && lastEnteredPassword && lastEnteredPassword.length >= 4) {
      chrome.runtime.sendMessage({
        type: 'PREPARE_SAVE',
        credential: {
          username: lastEnteredUsername,
          password: lastEnteredPassword,
          domain: window.location.hostname,
          url: window.location.href
        }
      });
    }
  }, true);

  // Listen to form submit events
  document.addEventListener('submit', (e) => {
    const form = e.target;
    processFormSubmit(form);
  });

  // Intercept button clicks that act as submit (common on React SPAs)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, input[type="submit"]');
    if (!btn) return;

    const form = btn.closest('form') || btn.closest('div[class*="login" i], div[class*="form" i], div[id*="login" i]');
    if (form) {
      // Small timeout to allow fields to capture input
      setTimeout(() => {
        processFormSubmit(form);
      }, 100);
    }
  });

  // Send typed credentials right before page unloads (redirect)
  window.addEventListener('beforeunload', () => {
    if (lastEnteredUsername && lastEnteredPassword && lastEnteredPassword.length >= 4) {
      chrome.runtime.sendMessage({
        type: 'PREPARE_SAVE',
        credential: {
          username: lastEnteredUsername,
          password: lastEnteredPassword,
          domain: window.location.hostname,
          url: window.location.href
        }
      });
    }
  });
}

function processFormSubmit(formElement) {
  const now = Date.now();
  if (now - lastSubmissionTime < 2000) return; // Debounce triggers
  
  let username = '';
  let password = '';

  // Scan current formElement inputs
  const inputs = formElement.querySelectorAll('input');
  for (const input of inputs) {
    const type = window.classifyField(input);
    if (type === 'USERNAME' || type === 'EMAIL') {
      username = input.value.trim();
    } else if (type === 'PASSWORD' || type === 'NEW_PASSWORD') {
      password = input.value;
    }
  }

  // Fallback to tracking variables
  if (!username) username = lastEnteredUsername;
  if (!password) password = lastEnteredPassword;

  if (username && password && password.length >= 4) {
    lastSubmissionTime = now;
    
    // Stash in background immediately in case the page unloads
    chrome.runtime.sendMessage({
      type: 'PREPARE_SAVE',
      credential: {
        username,
        password,
        domain: window.location.hostname,
        url: window.location.href
      }
    });

    // Check if password exists in matches for immediate inline notification (if SPA / no redirect)
    chrome.runtime.sendMessage({
      type: 'GET_CREDENTIALS',
      domain: window.location.hostname
    }, (response) => {
      if (response && response.success) {
        const matches = response.credentials || [];
        const match = matches.find(m => m.username === username);
        
        if (!match) {
          // New credential
          window.showSavePromptBanner({
            username,
            password,
            domain: window.location.hostname,
            url: window.location.href
          }, false);
        } else if (match.password !== password) {
          // Password update
          window.showSavePromptBanner({
            username,
            password,
            domain: window.location.hostname,
            url: window.location.href
          }, true);
        }
      }
    });
  }
}

window.setupSaveDetection = setupSaveDetection;
