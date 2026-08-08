// popup.js - KeeGuard Browser Extension Popup

document.addEventListener('DOMContentLoaded', async () => {
  // Check if unlocked
  chrome.runtime.sendMessage({ type: 'IS_UNLOCKED' }, (response) => {
    if (chrome.runtime.lastError) {
      const _ = chrome.runtime.lastError;
    }
    if (response && response.unlocked) {
      showMainScreen();
    } else {
      showLoginScreen();
    }
  });

  setupEventListeners();
});

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'block';
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('lock-btn').style.display = 'none';
}

function showMainScreen() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
  document.getElementById('lock-btn').style.display = 'block';
  loadMatchingItems();
  loadAllItems();
  loadProfiles();
}

function setupEventListeners() {
  // Login button
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  
  // Enter key on inputs triggers login
  const inputs = ['email-input', 'password-input'];
  inputs.forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  });

  // Lock button
  document.getElementById('lock-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
      showLoginScreen();
    });
  });

  // Tab switching
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetTab = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      document.getElementById(`tab-${targetTab}`).style.display = 'block';

      if (targetTab === 'generator') {
        generatePassword();
      } else if (targetTab === 'profiles') {
        loadProfiles();
      }
    });
  });

  // Search input events
  document.getElementById('matching-search').addEventListener('input', filterMatchingItems);
  document.getElementById('all-search').addEventListener('input', filterAllItems);
  const profSearch = document.getElementById('profiles-search');
  if (profSearch) profSearch.addEventListener('input', filterProfiles);
  const captureBtn = document.getElementById('capture-page-btn');
  if (captureBtn) captureBtn.addEventListener('click', capturePageFields);

  // Generator events
  document.getElementById('length-slider').addEventListener('input', (e) => {
    document.getElementById('length-val').textContent = e.target.value;
  });
  document.getElementById('generate-btn').addEventListener('click', generatePassword);
  document.getElementById('copy-gen-pwd').addEventListener('click', copyGeneratedPassword);
}

async function handleLogin() {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  const errorDiv = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');

  if (!email || !password) {
    errorDiv.textContent = 'Please enter both email and password';
    errorDiv.style.display = 'block';
    return;
  }

  errorDiv.style.display = 'none';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Unlocking...';

  chrome.runtime.sendMessage({
    type: 'LOGIN',
    email,
    password
  }, (response) => {
    if (chrome.runtime.lastError) {
      const _ = chrome.runtime.lastError;
    }
    loginBtn.disabled = false;
    loginBtn.textContent = 'Unlock';

    if (response && response.success) {
      showMainScreen();
    } else {
      errorDiv.textContent = response?.error || 'Failed to unlock. Check credentials.';
      errorDiv.style.display = 'block';
    }
  });
}

let loadedItems = [];
let loadedMatchingItems = [];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg) {
  const toast = document.getElementById('toast-msg');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.display = 'none';
  }, 2200);
}

async function sendMessageWithFallback(tabId, message, callback) {
  if (!tabId) return;

  chrome.tabs.sendMessage(tabId, message, async (res) => {
    if (chrome.runtime.lastError) {
      const _ = chrome.runtime.lastError;
      // Content script was not ready. Dynamically inject content scripts into page!
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: true },
          files: [
            'content/field-classifier.js',
            'content/form-detector.js',
            'content/fill-engine.js',
            'content/overlay.js',
            'content/save-detector.js',
            'content/content.js'
          ]
        });

        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, message, (retryRes) => {
            if (chrome.runtime.lastError) {
              const err = chrome.runtime.lastError;
              callback({ success: false, error: 'Cannot fill this page' });
            } else {
              callback(retryRes || { success: true });
            }
          });
        }, 120);
      } catch (e) {
        callback({ success: false, error: 'Cannot access page' });
      }
    } else {
      callback(res || { success: true });
    }
  });
}

async function autofillIntoPage(item) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    
    // Check if URL is restricted (chrome://, chrome-extension://, newtab)
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:'))) {
      showToast('Open a website page to auto-fill');
      return;
    }

    sendMessageWithFallback(tab.id, {
      type: 'AUTOFILL_CREDENTIAL',
      credential: item
    }, (res) => {
      if (res && res.success) {
        showToast(`⚡ Auto-filled ${res.filledCount || 1} field(s)!`);
      } else {
        showToast(res.error || 'Open a website page to auto-fill');
      }
    });
  } catch (err) {
    console.error('Autofill error:', err);
  }
}

async function loadMatchingItems() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  let domain = '';
  try {
    const url = new URL(tab.url);
    domain = url.hostname;
  } catch (e) {
    domain = '';
  }

  chrome.runtime.sendMessage({
    type: 'GET_CREDENTIALS',
    domain: domain
  }, (response) => {
    const listDiv = document.getElementById('matching-list');
    listDiv.innerHTML = '';

    if (response && response.success) {
      loadedMatchingItems = response.credentials || [];
      if (loadedMatchingItems.length === 0) {
        listDiv.innerHTML = '<div class="subtitle" style="text-align: center; margin-top: 20px;">No matching items for this site</div>';
        return;
      }
      renderList(listDiv, loadedMatchingItems);
    } else {
      listDiv.innerHTML = '<div class="error-msg">Failed to load items.</div>';
    }
  });
}

function loadAllItems() {
  chrome.runtime.sendMessage({
    type: 'GET_CREDENTIALS',
    domain: '' // Empty domain triggers getting all items
  }, (response) => {
    const listDiv = document.getElementById('all-list');
    listDiv.innerHTML = '';

    if (response && response.success) {
      loadedItems = response.credentials || [];
      if (loadedItems.length === 0) {
        listDiv.innerHTML = '<div class="subtitle" style="text-align: center; margin-top: 20px;">No saved items in vault</div>';
        return;
      }
      renderList(listDiv, loadedItems);
    } else {
      listDiv.innerHTML = '<div class="error-msg">Failed to load vault items.</div>';
    }
  });
}

function createDetailFieldRow(label, value, copyMsg = 'Copied!') {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const row = document.createElement('div');
  row.className = 'detail-row';
  row.innerHTML = `
    <span class="detail-label">${escapeHtml(label)}</span>
    <div class="detail-value-group">
      <input type="text" class="detail-input" value="${escapeHtml(value)}" readonly>
      <button class="action-btn-sm copy-field-btn" title="Copy ${escapeHtml(label)}">📋 Copy</button>
    </div>
  `;
  row.querySelector('.copy-field-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(String(value));
    showToast(copyMsg);
  });
  return row;
}

function renderList(container, items) {
  container.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';

    const header = document.createElement('div');
    header.className = 'item-card-header';

    const info = document.createElement('div');
    info.className = 'item-info';

    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = item.title || 'Untitled';

    const user = document.createElement('span');
    user.className = 'item-user';
    user.textContent = item.username || 'No username';

    info.appendChild(title);
    info.appendChild(user);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    // Quick Fill button
    const fillBtn = document.createElement('button');
    fillBtn.className = 'action-btn-sm';
    fillBtn.innerHTML = '⚡ Fill';
    fillBtn.title = 'Auto-fill into page';
    fillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      autofillIntoPage(item);
    });

    // Copy username
    const copyUser = document.createElement('button');
    copyUser.className = 'icon-btn';
    copyUser.innerHTML = '👤';
    copyUser.title = 'Copy Username';
    copyUser.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(item.username || '');
      showToast('Copied Username!');
    });

    // Copy password
    const copyPass = document.createElement('button');
    copyPass.className = 'icon-btn';
    copyPass.innerHTML = '🔑';
    copyPass.title = 'Copy Password';
    copyPass.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(item.password || '');
      showToast('Copied Password!');
    });

    actions.appendChild(fillBtn);
    actions.appendChild(copyUser);
    actions.appendChild(copyPass);

    header.appendChild(info);
    header.appendChild(actions);

    // Clicking header opens/closes details AND triggers autofill
    header.addEventListener('click', () => {
      const isExpanded = card.classList.contains('expanded');
      container.querySelectorAll('.item-card.expanded').forEach(c => {
        if (c !== card) c.classList.remove('expanded');
      });
      card.classList.toggle('expanded');
      if (!isExpanded) {
        autofillIntoPage(item);
      }
    });

    // Expanded Details Section
    const details = document.createElement('div');
    details.className = 'item-details';

    // 1. Username / Email
    if (item.username) {
      const uRow = createDetailFieldRow('Username / Email', item.username, 'Copied Username!');
      if (uRow) details.appendChild(uRow);
    }

    // 2. Password row (with eye toggle)
    if (item.password !== undefined && item.password !== null) {
      const pRow = document.createElement('div');
      pRow.className = 'detail-row';
      pRow.innerHTML = `
        <span class="detail-label">Password</span>
        <div class="detail-value-group">
          <input type="password" class="detail-input pwd-font pwd-view-input" value="${escapeHtml(item.password || '')}" readonly>
          <button class="action-btn-sm toggle-pwd-btn" title="Show/Hide Password">👁️</button>
          <button class="action-btn-sm copy-p-btn" title="Copy Password">📋 Copy</button>
        </div>
      `;
      const pwdInput = pRow.querySelector('.pwd-view-input');
      const togglePwdBtn = pRow.querySelector('.toggle-pwd-btn');
      togglePwdBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pwdInput.type === 'password') {
          pwdInput.type = 'text';
          togglePwdBtn.textContent = '🔒';
        } else {
          pwdInput.type = 'password';
          togglePwdBtn.textContent = '👁️';
        }
      });
      pRow.querySelector('.copy-p-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(item.password || '');
        showToast('Copied Password!');
      });
      details.appendChild(pRow);
    }

    // 3. Website URL
    if (item.url) {
      const urlRow = createDetailFieldRow('Website URL', item.url, 'Copied URL!');
      if (urlRow) details.appendChild(urlRow);
    }

    // 4. Custom Fields (if saved as object)
    if (item.customFields && typeof item.customFields === 'object') {
      Object.entries(item.customFields).forEach(([k, v]) => {
        const cfRow = createDetailFieldRow(k, v, `Copied ${k}!`);
        if (cfRow) details.appendChild(cfRow);
      });
    }

    // 5. Parse Note for structured lines (UPI ID, ATM Pin, Bank, IFSC, Account Number, etc.)
    if (item.note && typeof item.note === 'string' && item.note.trim()) {
      const lines = item.note.split(/\r?\n/);
      const remainingLines = [];

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        // Check if line looks like "Key: Value" or "Key = Value"
        const kvMatch = trimmed.match(/^([A-Za-z0-9 _\/\-]+)[:=]\s*(.+)$/);
        if (kvMatch) {
          const keyName = kvMatch[1].trim();
          const valStr = kvMatch[2].trim();
          const kvRow = createDetailFieldRow(keyName, valStr, `Copied ${keyName}!`);
          if (kvRow) details.appendChild(kvRow);
        } else {
          remainingLines.push(trimmed);
        }
      });

      if (remainingLines.length > 0) {
        const noteRow = createDetailFieldRow('Notes', remainingLines.join('\n'), 'Copied Notes!');
        if (noteRow) details.appendChild(noteRow);
      }
    }

    // 6. Card Data (for saved Cards)
    if (item.cardData) {
      const cd = item.cardData;
      if (cd.number) {
        const r = createDetailFieldRow('Card Number', cd.number, 'Copied Card Number!');
        if (r) details.appendChild(r);
      }
      if (cd.cardholderName) {
        const r = createDetailFieldRow('Cardholder Name', cd.cardholderName, 'Copied Name!');
        if (r) details.appendChild(r);
      }
      if (cd.expMonth || cd.expYear) {
        const exp = `${cd.expMonth || ''}/${cd.expYear || ''}`;
        const r = createDetailFieldRow('Expiry Date', exp, 'Copied Expiry!');
        if (r) details.appendChild(r);
      }
      if (cd.cvv) {
        const r = createDetailFieldRow('CVV / CVC', cd.cvv, 'Copied CVV!');
        if (r) details.appendChild(r);
      }
    }

    // 7. Address Data / Identity Data
    if (item.addressData) {
      const ad = item.addressData;
      Object.entries(ad).forEach(([k, v]) => {
        if (v && typeof v === 'string') {
          const r = createDetailFieldRow(k, v, `Copied ${k}!`);
          if (r) details.appendChild(r);
        }
      });
    }

    // Big Auto-fill button
    const bigFillBtn = document.createElement('button');
    bigFillBtn.className = 'fill-page-btn';
    bigFillBtn.innerHTML = '⚡ Auto-Fill into Page';
    bigFillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      autofillIntoPage(item);
    });
    details.appendChild(bigFillBtn);

    card.appendChild(header);
    card.appendChild(details);

    container.appendChild(card);
  });
}

function filterMatchingItems() {
  const query = document.getElementById('matching-search').value.toLowerCase().trim();
  const listDiv = document.getElementById('matching-list');
  
  if (!query) {
    if (loadedMatchingItems.length === 0) {
      listDiv.innerHTML = '<div class="subtitle" style="text-align: center; margin-top: 20px;">No matching items for this site</div>';
    } else {
      renderList(listDiv, loadedMatchingItems);
    }
    return;
  }

  const matches = loadedMatchingItems.filter(item => 
    (item.title && item.title.toLowerCase().includes(query)) ||
    (item.username && item.username.toLowerCase().includes(query)) ||
    (item.url && item.url.toLowerCase().includes(query))
  );

  if (matches.length > 0) {
    renderList(listDiv, matches);
  } else {
    // Search across ALL vault items when matching search returns none
    const allMatches = loadedItems.filter(item => 
      (item.title && item.title.toLowerCase().includes(query)) ||
      (item.username && item.username.toLowerCase().includes(query)) ||
      (item.url && item.url.toLowerCase().includes(query))
    );

    if (allMatches.length > 0) {
      listDiv.innerHTML = '<div class="subtitle" style="text-align: center; margin: 8px 0 4px;">Found in All Vault Items:</div>';
      const wrapper = document.createElement('div');
      renderList(wrapper, allMatches);
      listDiv.appendChild(wrapper);
    } else {
      listDiv.innerHTML = '<div class="subtitle" style="text-align: center; margin-top: 20px;">No items match your search</div>';
    }
  }
}

function filterAllItems() {
  const query = document.getElementById('all-search').value.toLowerCase().trim();
  const listDiv = document.getElementById('all-list');

  const filtered = loadedItems.filter(item => 
    (item.title && item.title.toLowerCase().includes(query)) ||
    (item.username && item.username.toLowerCase().includes(query)) ||
    (item.url && item.url.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    listDiv.innerHTML = '<div class="subtitle" style="text-align: center; margin-top: 20px;">No items match your search</div>';
  } else {
    renderList(listDiv, filtered);
  }
}

let loadedProfiles = [];

async function loadProfiles() {
  const listDiv = document.getElementById('profiles-list');
  if (!listDiv) return;
  listDiv.innerHTML = '<div class="subtitle" style="text-align: center; margin-top: 20px;">Loading profiles...</div>';

  chrome.runtime.sendMessage({ type: 'GET_PROFILES' }, (res) => {
    if (chrome.runtime.lastError) {
      const _ = chrome.runtime.lastError;
    }
    if (res && res.success) {
      loadedProfiles = res.profiles || [];
      renderProfiles(listDiv, loadedProfiles);
    } else {
      listDiv.innerHTML = '<div class="subtitle" style="text-align: center; margin-top: 20px;">No field profiles found</div>';
    }
  });
}

function filterProfiles() {
  const query = (document.getElementById('profiles-search')?.value || '').toLowerCase().trim();
  const listDiv = document.getElementById('profiles-list');
  if (!listDiv) return;

  const filtered = loadedProfiles.filter(p =>
    (p.name && p.name.toLowerCase().includes(query)) ||
    (p.fields && p.fields.some(f => f.name && f.name.toLowerCase().includes(query)))
  );

  if (filtered.length === 0) {
    listDiv.innerHTML = '<div class="subtitle" style="text-align: center; margin-top: 20px;">No profiles match search</div>';
  } else {
    renderProfiles(listDiv, filtered);
  }
}

function renderProfiles(container, profiles) {
  container.innerHTML = '';
  if (!profiles || profiles.length === 0) {
    container.innerHTML = '<div class="subtitle" style="text-align: center; margin-top: 20px;">No custom profiles created yet</div>';
    return;
  }

  profiles.forEach(profile => {
    const card = document.createElement('div');
    card.className = 'item-card';

    const header = document.createElement('div');
    header.className = 'item-card-header';

    const info = document.createElement('div');
    info.className = 'item-info';

    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = profile.name || 'Untitled Profile';

    const user = document.createElement('span');
    user.className = 'item-user';
    const count = (profile.fields || []).length;
    let domain = '';
    if (profile.url) {
      try {
        domain = new URL(profile.url).hostname.replace('www.', '');
      } catch(e) {
        domain = profile.url;
      }
    }
    user.textContent = `${count} field${count !== 1 ? 's' : ''}${domain ? ' · ' + domain : ''}`;

    info.appendChild(title);
    info.appendChild(user);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    // Quick Fill button (styled identical to vault item Fill button)
    const fillBtn = document.createElement('button');
    fillBtn.className = 'action-btn-sm';
    fillBtn.innerHTML = '⚡ Fill';
    fillBtn.title = 'Fill all matching fields on page';
    fillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      autofillProfileIntoPage(profile);
    });

    actions.appendChild(fillBtn);

    // Delete Profile button
    const delProfileBtn = document.createElement('button');
    delProfileBtn.className = 'action-btn-sm';
    delProfileBtn.style.padding = '4px 8px';
    delProfileBtn.innerHTML = '🗑️';
    delProfileBtn.title = 'Delete profile';
    delProfileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete profile "${profile.name}"?`)) {
        chrome.runtime.sendMessage({ type: 'DELETE_PROFILE', profileId: profile.id }, () => {
          showToast('Profile deleted');
          loadProfiles();
        });
      }
    });
    actions.appendChild(delProfileBtn);
    header.appendChild(info);
    header.appendChild(actions);
    card.appendChild(header);

    // Click header to toggle item-details expansion & trigger autofill
    header.addEventListener('click', () => {
      const isExpanded = card.classList.contains('expanded');
      container.querySelectorAll('.item-card.expanded').forEach(c => {
        if (c !== card) c.classList.remove('expanded');
      });
      card.classList.toggle('expanded');
      if (!isExpanded) {
        autofillProfileIntoPage(profile);
      }
    });

    // Expanded Details Section (matching vault item detail design)
    const details = document.createElement('div');
    details.className = 'item-details';

    // 1. Website URL if present
    if (profile.url) {
      const urlRow = createDetailFieldRow('Website URL', profile.url, 'Copied URL!');
      if (urlRow) details.appendChild(urlRow);
    }

    // 2. Custom Fields inside Profile
    const fields = profile.fields || [];
    fields.forEach(f => {
      if (f.sensitive || f.type === 'password') {
        const pRow = document.createElement('div');
        pRow.className = 'detail-row';
        pRow.innerHTML = `
          <span class="detail-label">${escapeHtml(f.name)}</span>
          <div class="detail-value-group">
            <input type="password" class="detail-input pwd-font pwd-view-input" value="${escapeHtml(f.value || '')}" readonly>
            <button class="action-btn-sm toggle-pwd-btn" title="Show/Hide">👁️</button>
            <button class="action-btn-sm copy-p-btn" title="Copy ${escapeHtml(f.name)}">📋 Copy</button>
          </div>
        `;
        const pwdInput = pRow.querySelector('.pwd-view-input');
        const togglePwdBtn = pRow.querySelector('.toggle-pwd-btn');
        togglePwdBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            togglePwdBtn.textContent = '🔒';
          } else {
            pwdInput.type = 'password';
            togglePwdBtn.textContent = '👁️';
          }
        });
        pRow.querySelector('.copy-p-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          copyToClipboard(f.value || '');
          showToast(`Copied ${f.name}!`);
        });
        details.appendChild(pRow);
      } else {
        const row = createDetailFieldRow(f.name, f.value, `Copied ${f.name}!`);
        if (row) details.appendChild(row);
      }
    });

    // Big Auto-fill button at bottom of details
    const bigFillBtn = document.createElement('button');
    bigFillBtn.className = 'fill-page-btn';
    bigFillBtn.innerHTML = '⚡ Auto-Fill Profile into Page';
    bigFillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      autofillProfileIntoPage(profile);
    });
    details.appendChild(bigFillBtn);

    card.appendChild(details);
    container.appendChild(card);
  });
}

async function autofillProfileIntoPage(profile) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:'))) {
      showToast('Open a website page to auto-fill');
      return;
    }

    sendMessageWithFallback(tab.id, {
      type: 'AUTOFILL_PROFILE',
      profile: profile
    }, (res) => {
      if (res && res.success) {
        showToast(`⚡ Auto-filled ${res.filledCount || 1} field(s)!`);
      } else {
        showToast(res.error || 'Open a website page to auto-fill');
      }
    });
  } catch (e) {
    console.error('Failed to autofill profile:', e);
  }
}

// ── Capture from Page ───────────────────────────────────────────────────

let capturedFields = [];

async function capturePageFields() {
  const captureBtn = document.getElementById('capture-page-btn');
  if (captureBtn) { captureBtn.textContent = '⏳'; captureBtn.disabled = true; }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
      showToast('Open a real webpage to capture fields');
      if (captureBtn) { captureBtn.textContent = '📷 Capture'; captureBtn.disabled = false; }
      return;
    }

    // Try sending message to content script first
    chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_PAGE_FIELDS' }, async (res) => {
      if (chrome.runtime.lastError) { const _ = chrome.runtime.lastError; }

      if (res && res.success && res.fields && res.fields.length > 0) {
        if (captureBtn) { captureBtn.textContent = '📷 Capture'; captureBtn.disabled = false; }
        capturedFields = res.fields;
        showCaptureModal(res.fields, res.url || tab.url);
        return;
      }

      // Fallback: executeScript across all frames in parallel
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: () => {
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
              if (el.id) {
                try {
                  const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                  if (lbl) { const t = cleanLabelText(lbl.innerText); if (t) return t; }
                } catch(e) {}
              }
              const enclosingLabel = el.closest('label');
              if (enclosingLabel) {
                const clone = enclosingLabel.cloneNode(true);
                clone.querySelectorAll('input, select, textarea, button, script, style').forEach(n => n.remove());
                const t = cleanLabelText(clone.innerText);
                if (t) return t;
              }
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
              let parent = el.parentElement;
              for (let depth = 0; depth < 4 && parent && parent.tagName !== 'BODY' && parent.tagName !== 'FORM'; depth++) {
                const textNodes = [];
                const children = Array.from(parent.children);
                for (const child of children) {
                  if (child.contains(el)) break;
                  if (['SCRIPT', 'STYLE', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(child.tagName)) continue;
                  const txt = child.innerText?.trim();
                  if (txt && txt.length > 1 && txt.length < 100) textNodes.push(txt);
                }
                if (textNodes.length > 0) {
                  const cleaned = cleanLabelText(textNodes.join(' '));
                  if (cleaned) return cleaned;
                }
                parent = parent.parentElement;
              }
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
              const nameAttr = el.getAttribute('name') || el.getAttribute('id');
              if (nameAttr?.trim()) return cleanLabelText(nameAttr.replace(/[-_]/g, ' '));
              return `Field ${fallbackIdx} (${(el.type || el.tagName || 'field').toUpperCase()})`;
            }

            const elements = document.querySelectorAll(
              'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea, [role="combobox"]'
            );

            let index = 1;
            elements.forEach(el => {
              if (el.disabled) return;
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

            return { fields: captured, url: window.location.href };
          }
        });

        if (captureBtn) { captureBtn.textContent = '📷 Capture'; captureBtn.disabled = false; }

        let allCaptured = [];
        if (results && results.length > 0) {
          results.forEach(r => {
            if (r.result && r.result.fields && r.result.fields.length > 0) {
              allCaptured = allCaptured.concat(r.result.fields);
            }
          });
        }

        // Deduplicate across frames
        const uniqueFields = [];
        const seenKeys = new Set();
        allCaptured.forEach(f => {
          const k = f.label.toLowerCase();
          if (!seenKeys.has(k)) {
            seenKeys.add(k);
            uniqueFields.push(f);
          }
        });

        if (uniqueFields.length > 0) {
          capturedFields = uniqueFields;
          showCaptureModal(uniqueFields, tab.url);
        } else {
          showToast('No form fields found on this page');
        }
      } catch (execErr) {
        if (captureBtn) { captureBtn.textContent = '📷 Capture'; captureBtn.disabled = false; }
        console.error('[Capture] executeScript fallback failed:', execErr);
        showToast('No form fields found on this page');
      }
    });
  } catch (e) {
    if (captureBtn) { captureBtn.textContent = '📷 Capture'; captureBtn.disabled = false; }
    showToast('Could not capture fields');
  }
}

function showCaptureModal(fields, pageUrl) {
  const modal = document.getElementById('capture-modal');
  const subtitle = document.getElementById('capture-subtitle');
  const fieldsList = document.getElementById('capture-fields-list');
  const nameInput = document.getElementById('capture-profile-name');
  const saveBtn = document.getElementById('capture-save-btn');
  const closeBtn = document.getElementById('capture-close-btn');
  if (!modal || !fieldsList) return;

  // Set subtitle
  let urlHost = '';
  try { urlHost = new URL(pageUrl).hostname; } catch(e) {}
  if (subtitle) subtitle.textContent = `${fields.length} fields found${urlHost ? ' · ' + urlHost : ''}`;
  if (nameInput) {
    nameInput.value = '';
    nameInput.placeholder = urlHost ? `Profile name (e.g. ${urlHost.replace('www.', '')})` : 'Profile name (e.g. Flipkart Listing)';
  }

  // Render field checkboxes
  fieldsList.innerHTML = '';
  fields.forEach((f, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = `cap-field-${i}`;
    chk.checked = true;
    chk.style.cssText = 'width:16px;height:16px;accent-color:#06b6d4;flex-shrink:0;cursor:pointer;';
    const info = document.createElement('label');
    info.htmlFor = `cap-field-${i}`;
    info.style.cssText = 'flex:1;min-width:0;cursor:pointer;';
    info.innerHTML = `
      <div style="font-size:12px;color:#cbd5e1;font-weight:500;truncate;">${escapeHtml(f.label)}</div>
      <div style="font-size:11px;color:${f.sensitive ? '#fbbf24' : '#64748b'};truncate;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.sensitive ? '••••••••' : (f.value || '(empty)')}</div>
    `;
    row.appendChild(chk);
    row.appendChild(info);
    fieldsList.appendChild(row);
  });

  modal.style.display = 'flex';

  // Close
  if (closeBtn) {
    closeBtn.onclick = () => { modal.style.display = 'none'; };
  }
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

  // Save
  if (saveBtn) {
    saveBtn.onclick = async () => {
      let name = (nameInput?.value || '').trim();
      if (!name) {
        name = urlHost ? urlHost.replace('www.', '') : 'Captured Profile';
      }
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      const selected = fields.filter((_, i) => {
        const chk = document.getElementById(`cap-field-${i}`);
        return chk && chk.checked;
      });

      if (selected.length === 0) { showToast('Select at least 1 field'); saveBtn.disabled = false; saveBtn.textContent = '✅ Save as Profile'; return; }

      const profileFields = selected.map((f, i) => ({
        id: 'field_' + Date.now() + '_' + i,
        name: f.label,
        value: f.value || '',
        type: f.sensitive ? 'password' : (f.tagInput ? 'tagInput' : 'text'),
        sensitive: f.sensitive || false,
        pageIndex: f.pageIndex || null,   // capture-time DOM index (1-based)
        tagInput: f.tagInput || false,    // true = chip/tag multi-value input
      }));

      // Send to service worker to save via the vault
      chrome.runtime.sendMessage({
        type: 'SAVE_CAPTURED_PROFILE',
        profile: { name, fields: profileFields, icon: 'Globe', color: '#06b6d4', url: pageUrl }
      }, (res) => {
        if (chrome.runtime.lastError) { const _ = chrome.runtime.lastError; }
        modal.style.display = 'none';
        saveBtn.disabled = false;
        saveBtn.textContent = '✅ Save as Profile';
        if (res && res.success) {
          showToast(`✅ Profile "${name}" saved with ${profileFields.length} fields!`);
          loadProfiles(); // refresh list
        } else {
          showToast('Failed to save profile');
        }
      });
    };
  }
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text);
}

// Password Generator
function generatePassword() {
  const length = parseInt(document.getElementById('length-slider').value);
  const upper = document.getElementById('opt-upper').checked;
  const lower = document.getElementById('opt-lower').checked;
  const nums = document.getElementById('opt-nums').checked;
  const symbols = document.getElementById('opt-symbols').checked;

  const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
  const numChars = '0123456789';
  const symChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let pool = '';
  if (upper) pool += upperChars;
  if (lower) pool += lowerChars;
  if (nums) pool += numChars;
  if (symbols) pool += symChars;

  if (!pool) {
    document.getElementById('gen-pwd').value = 'Select an option!';
    return;
  }

  let pwd = '';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    pwd += pool[bytes[i] % pool.length];
  }

  document.getElementById('gen-pwd').value = pwd;
}

function copyGeneratedPassword() {
  const pwd = document.getElementById('gen-pwd').value;
  if (pwd && pwd !== 'Select an option!') {
    copyToClipboard(pwd);
  }
}
