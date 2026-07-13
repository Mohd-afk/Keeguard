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

async function loadMatchingItems() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  const url = new URL(tab.url);
  const domain = url.hostname;

  chrome.runtime.sendMessage({
    type: 'GET_CREDENTIALS',
    domain: domain
  }, (response) => {
    const listDiv = document.getElementById('matching-list');
    listDiv.innerHTML = '';

    if (response && response.success) {
      const creds = response.credentials || [];
      if (creds.length === 0) {
        listDiv.innerHTML = '<div class="subtitle" style="text-align: center; margin-top: 20px;">No matching items for this site</div>';
        return;
      }
      renderList(listDiv, creds);
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
      renderList(listDiv, loadedItems);
    }
  });
}

function renderList(container, items) {
  container.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';

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

    // Copy username
    const copyUser = document.createElement('button');
    copyUser.className = 'icon-btn';
    copyUser.innerHTML = '👤';
    copyUser.title = 'Copy Username';
    copyUser.addEventListener('click', () => copyToClipboard(item.username));

    // Copy password
    const copyPass = document.createElement('button');
    copyPass.className = 'icon-btn';
    copyPass.innerHTML = '🔑';
    copyPass.title = 'Copy Password';
    copyPass.addEventListener('click', () => copyToClipboard(item.password));

    actions.appendChild(copyUser);
    actions.appendChild(copyPass);

    card.appendChild(info);
    card.appendChild(actions);

    container.appendChild(card);
  });
}

function filterMatchingItems() {
  const query = document.getElementById('matching-search').value.toLowerCase();
  const listDiv = document.getElementById('matching-list');
  const cards = listDiv.querySelectorAll('.item-card');
  
  cards.forEach(card => {
    const title = card.querySelector('.item-title').textContent.toLowerCase();
    const user = card.querySelector('.item-user').textContent.toLowerCase();
    if (title.includes(query) || user.includes(query)) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

function filterAllItems() {
  const query = document.getElementById('all-search').value.toLowerCase();
  const filtered = loadedItems.filter(item => 
    (item.title && item.title.toLowerCase().includes(query)) ||
    (item.username && item.username.toLowerCase().includes(query))
  );
  renderList(document.getElementById('all-list'), filtered);
}

function copyToClipboard(text) {
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
