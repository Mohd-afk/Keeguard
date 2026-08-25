// PURPOSE: Browser extension content script managing DOM overlay.
// content/overlay.js

let activeSuggestionDropdown = null;

function createAutofillIcon(inputElement, onClick) {
  // Check if icon already exists
  if (inputElement.parentElement.querySelector('.keeguard-autofill-icon')) return;

  const icon = document.createElement('div');
  icon.className = 'keeguard-autofill-icon';
  icon.style.cssText = `
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    cursor: pointer;
    z-index: 10000;
    opacity: 0.5;
    transition: opacity 0.2s;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%236366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>');
    background-size: contain;
    background-repeat: no-repeat;
  `;

  icon.addEventListener('mouseenter', () => icon.style.opacity = '1');
  icon.addEventListener('mouseleave', () => icon.style.opacity = '0.5');
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    onClick(e);
  });

  // Ensure parent has position relative
  const parent = inputElement.parentElement;
  const computedStyle = window.getComputedStyle(parent);
  if (computedStyle.position === 'static') {
    parent.style.position = 'relative';
  }

  // Adjust padding of input so text doesn't overlap the icon
  const currentPaddingRight = parseInt(window.getComputedStyle(inputElement).paddingRight);
  if (currentPaddingRight < 35) {
    inputElement.style.paddingRight = '35px';
  }

  parent.appendChild(icon);
}

function showSuggestionDropdown(anchorElement, credentials, onSelect) {
  removeSuggestionDropdown();

  const rect = anchorElement.getBoundingClientRect();
  const host = document.createElement('div');
  host.id = 'keeguard-dropdown-host';
  host.style.cssText = `
    position: absolute;
    left: ${rect.left + window.scrollX}px;
    top: ${rect.bottom + window.scrollY + 5}px;
    z-index: 2147483647;
    width: ${Math.max(rect.width, 220)}px;
  `;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const container = document.createElement('div');
  container.className = 'dropdown-container';

  shadow.innerHTML = `
    <style>
      .dropdown-container {
        background: #0a0a0f;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        padding: 6px;
        font-family: system-ui, -apple-system, sans-serif;
        color: #e0e0e0;
        animation: fadeIn 0.2s ease-out;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .dropdown-item {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .dropdown-item:hover {
        background: rgba(99, 102, 241, 0.15);
      }
      .item-logo {
        width: 18px;
        height: 18px;
        margin-right: 10px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.05);
      }
      .item-details {
        display: flex;
        flex-direction: column;
      }
      .item-title {
        font-size: 13px;
        font-weight: 600;
        color: #fff;
      }
      .item-subtitle {
        font-size: 11px;
        color: #888;
        margin-top: 1px;
      }
    </style>
  `;

  credentials.forEach(cred => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    
    // Icon
    const logo = document.createElement('div');
    logo.className = 'item-logo';
    const cleanUrl = cred.uris && cred.uris[0] ? cred.uris[0] : '';
    if (cleanUrl.includes('.')) {
      const img = document.createElement('img');
      img.src = `https://www.google.com/s2/favicons?domain=${cleanUrl}&sz=32`;
      img.style.width = '14px';
      img.style.height = '14px';
      img.onerror = () => { logo.innerHTML = '🔑'; };
      logo.appendChild(img);
    } else {
      logo.innerHTML = '🔑';
    }

    const details = document.createElement('div');
    details.className = 'item-details';
    
    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = cred.username || 'Saved Card/Address';

    const subtitle = document.createElement('span');
    subtitle.className = 'item-subtitle';
    subtitle.textContent = cred.title || 'KeeGuard Item';

    details.appendChild(title);
    details.appendChild(subtitle);
    
    item.appendChild(logo);
    item.appendChild(details);

    item.addEventListener('click', () => {
      onSelect(cred);
      removeSuggestionDropdown();
    });

    container.appendChild(item);
  });

  shadow.appendChild(container);
  activeSuggestionDropdown = host;

  // Click outside listener
  document.addEventListener('click', handleOutsideClick);
}

function removeSuggestionDropdown() {
  if (activeSuggestionDropdown) {
    activeSuggestionDropdown.remove();
    activeSuggestionDropdown = null;
    document.removeEventListener('click', handleOutsideClick);
  }
}

function handleOutsideClick(e) {
  if (activeSuggestionDropdown && !activeSuggestionDropdown.contains(e.target)) {
    removeSuggestionDropdown();
  }
}

function showSavePromptBanner(credentials, isUpdate = false) {
  const existing = document.getElementById('keeguard-save-prompt-host');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'keeguard-save-prompt-host';
  host.style.cssText = 'all: initial; position: fixed; top: 20px; right: 20px; z-index: 2147483647;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .banner {
        width: 320px;
        background: #0a0a0f;
        border: 1px solid rgba(99, 102, 241, 0.25);
        border-radius: 14px;
        box-shadow: 0 12px 30px rgba(0,0,0,0.6);
        padding: 16px;
        color: #e0e0e0;
        font-family: system-ui, -apple-system, sans-serif;
        animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes slideIn {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      .logo {
        width: 20px;
        height: 20px;
        background: linear-gradient(135deg, #6366f1, #a78bfa);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        color: #fff;
        font-weight: bold;
      }
      .title {
        font-weight: 600;
        font-size: 14px;
        color: #fff;
      }
      .details {
        background: rgba(255,255,255,0.03);
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 14px;
        font-size: 12px;
      }
      .field {
        margin-bottom: 6px;
      }
      .field:last-child {
        margin-bottom: 0;
      }
      .label {
        color: #777;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .val {
        color: #fff;
        font-weight: 500;
      }
      .buttons {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      button {
        border: none;
        padding: 8px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.2s;
      }
      .btn-dismiss {
        background: rgba(255,255,255,0.06);
        color: #aaa;
      }
      .btn-dismiss:hover {
        background: rgba(255,255,255,0.1);
        color: #fff;
      }
      .btn-save {
        background: linear-gradient(135deg, #6366f1, #a78bfa);
        color: #fff;
      }
      .btn-save:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }
    </style>
    
    <div class="banner">
      <div class="header">
        <div class="logo">K</div>
        <span class="title">${isUpdate ? 'Update Password?' : 'Save to KeeGuard?'}</span>
      </div>
      <div class="details">
        <div class="field">
          <div class="label">Username</div>
          <div class="val">${credentials.username}</div>
        </div>
        <div class="field">
          <div class="label">Website</div>
          <div class="val">${credentials.domain}</div>
        </div>
      </div>
      <div class="buttons">
        <button class="btn-dismiss" id="dismiss-btn">Never</button>
        <button class="btn-save" id="save-btn">${isUpdate ? 'Update' : 'Save'}</button>
      </div>
    </div>
  `;

  shadow.getElementById('dismiss-btn').addEventListener('click', () => host.remove());
  shadow.getElementById('save-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'SAVE_CREDENTIAL',
      credential: {
        username: credentials.username,
        password: credentials.password,
        url: credentials.url,
        title: credentials.domain
      }
    }, () => {
      host.remove();
    });
  });

  // Auto remove after 25 seconds
  setTimeout(() => host.remove(), 25000);
}

window.createAutofillIcon = createAutofillIcon;
window.showSuggestionDropdown = showSuggestionDropdown;
window.removeSuggestionDropdown = removeSuggestionDropdown;
window.showSavePromptBanner = showSavePromptBanner;
