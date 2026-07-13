// popup.js - KeeGuard Browser Extension Popup

document.addEventListener('DOMContentLoaded', async () => {
  // Check if unlocked
  chrome.runtime.sendMessage({ type: 'IS_UNLOCKED' }, (response) => {
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
      }
    });
  });

  // Search input events
  document.getElementById('matching-search').addEventListener('input', filterMatchingItems);
  document.getElementById('all-search').addEventListener('input', filterAllItems);

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

async function autofillIntoPage(item) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, {
      type: 'AUTOFILL_CREDENTIAL',
      credential: item
    }, (res) => {
      if (chrome.runtime.lastError) {
        showToast('Open site page to auto-fill');
        return;
      }
      if (res && res.success) {
        showToast('⚡ Auto-filled into page!');
      } else {
        showToast('⚡ Credentials sent to page');
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
