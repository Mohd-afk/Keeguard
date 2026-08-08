// content/fill-engine.js
// v5.0.5 – Complete rewrite of autofill engine with robust dropdown support

// ─── Utilities ─────────────────────────────────────────────────────────────

function normalizeToken(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Native SELECT fill ─────────────────────────────────────────────────────

function setSelectValue(selectEl, value) {
  if (!selectEl || selectEl.tagName !== 'SELECT') return false;

  const targetVal = String(value).trim().toLowerCase();
  const targetToken = normalizeToken(targetVal);

  const options = Array.from(selectEl.options || []);
  if (options.length === 0) return false;

  let matchedIdx = -1;

  // 1. Exact match
  matchedIdx = options.findIndex(opt => {
    const val = (opt.value || '').trim().toLowerCase();
    const txt = (opt.text || opt.textContent || '').trim().toLowerCase();
    return val === targetVal || txt === targetVal;
  });

  // 2. Token substring match
  if (matchedIdx === -1) {
    matchedIdx = options.findIndex(opt => {
      const valToken = normalizeToken(opt.value);
      const txtToken = normalizeToken(opt.text || opt.textContent);
      return valToken.includes(targetToken) || targetToken.includes(valToken) ||
             txtToken.includes(targetToken) || targetToken.includes(txtToken);
    });
  }

  // 3. Word-level fallback
  if (matchedIdx === -1 && targetToken.length >= 2) {
    matchedIdx = options.findIndex(opt => {
      const txtToken = normalizeToken(opt.text || opt.textContent);
      return targetToken.split(' ').filter(w => w.length >= 2).some(w => txtToken.includes(w));
    });
  }

  if (matchedIdx === -1) return false;

  selectEl.focus();
  selectEl.selectedIndex = matchedIdx;
  options[matchedIdx].selected = true;

  try {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(selectEl, options[matchedIdx].value);
    else selectEl.value = options[matchedIdx].value;
  } catch (e) {
    selectEl.value = options[matchedIdx].value;
  }

  ['input', 'change', 'blur'].forEach(evType =>
    selectEl.dispatchEvent(new Event(evType, { bubbles: true, composed: true }))
  );
  return true;
}

// ─── React / SPA input fill ─────────────────────────────────────────────────

function setInputValue(element, value) {
  element.focus();

  // React 16+ internal tracker — set OLD value so React notices the change
  const tracker = element._valueTracker;
  if (tracker) tracker.setValue(element.value);

  const proto = element.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;

  ['input', 'change', 'blur'].forEach(evType =>
    element.dispatchEvent(new Event(evType, { bubbles: true, composed: true }))
  );
  // Also fire keydown/keyup for Angular / Vue
  ['keydown', 'keyup'].forEach(evType =>
    element.dispatchEvent(new KeyboardEvent(evType, { bubbles: true, composed: true }))
  );
}

// ─── Custom dropdown (React/SPA) fill ──────────────────────────────────────

/**
 * Attempts to open a custom dropdown element and pick the right option.
 * Uses a polling loop (up to ~2 seconds) waiting for dropdown options to appear.
 */
function fillCustomDropdown(triggerElement, value) {
  const targetToken = normalizeToken(String(value));
  if (!targetToken) return;

  // Open the dropdown
  try { triggerElement.focus(); } catch (e) {}
  try { triggerElement.click(); } catch (e) {}

  let attempts = 0;
  const maxAttempts = 16; // 16 × 120ms = ~2s

  function tryPickOption() {
    attempts++;
    const optionSelector = [
      '[role="option"]',
      '[role="menuitem"]',
      '[role="listitem"]',
      '.select__option',
      '.Select-option',
      '.dropdown-item',
      'li[class*="option"]',
      'li[class*="item"]',
      'div[class*="option"]:not([class*="container"]):not([class*="wrapper"])',
      'div[class*="menu-item"]',
      'div[class*="MenuItem"]',
      'div[class*="selectOption"]',
      'div[class*="SelectItem"]',
      '[class*="dropdown"] li',
      '[class*="dropdown"] div[role]',
    ].join(', ');

    const options = document.querySelectorAll(optionSelector);
    let picked = false;

    for (const opt of options) {
      if (!opt.offsetParent && opt.getBoundingClientRect().width === 0) continue; // Not visible
      const optText = normalizeToken(opt.innerText || opt.textContent || '');
      if (!optText) continue;

      // Exact token match first, then containment
      if (optText === targetToken ||
          optText.includes(targetToken) ||
          targetToken.includes(optText)) {
        try { opt.focus(); opt.click(); } catch (e) {}
        picked = true;
        break;
      }
    }

    if (!picked && attempts < maxAttempts) {
      setTimeout(tryPickOption, 120);
    }
  }

  setTimeout(tryPickOption, 80);
}

// ─── setFieldValue (main entry point) ──────────────────────────────────────

function setFieldValue(element, value) {
  if (!element || value === undefined || value === null || String(value).trim() === '') return;
  const strValue = String(value).trim();

  // Native <select>
  if (element.tagName === 'SELECT') {
    setSelectValue(element, strValue);
    return;
  }

  // Detect custom dropdown triggers
  const role = (element.getAttribute('role') || '').toLowerCase();
  const ariaHasPopup = (element.getAttribute('aria-haspopup') || '').toLowerCase();
  const isDropdownTrigger =
    role === 'combobox' ||
    role === 'listbox' ||
    ariaHasPopup === 'listbox' ||
    ariaHasPopup === 'true' ||
    ariaHasPopup === 'menu';

  // Standard input / textarea
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    setInputValue(element, strValue);
    // If this input is ALSO a combobox trigger, fire custom dropdown too
    if (isDropdownTrigger) fillCustomDropdown(element, strValue);
    return;
  }

  // Pure custom dropdown trigger (div/span with role)
  if (isDropdownTrigger) {
    fillCustomDropdown(element, strValue);
    return;
  }

  // Div/span contenteditable
  if (element.getAttribute('contenteditable') === 'true') {
    element.focus();
    element.textContent = strValue;
    ['input', 'change', 'blur'].forEach(evType =>
      element.dispatchEvent(new Event(evType, { bubbles: true, composed: true }))
    );
  }
}

// ─── Data extraction from profile / vault item ─────────────────────────────

function collectAllKeyValuePairs(data) {
  const kvPairs = [];
  if (!data) return kvPairs;

  const seen = new Set();
  const addPair = (k, v) => {
    if (!k) return;
    const kStr = String(k).trim();
    const vStr = v !== undefined && v !== null ? String(v).trim() : '';
    if (!kStr || !vStr) return;
    const key = kStr.toLowerCase();
    if (seen.has(key)) return; // First definition wins
    seen.add(key);
    kvPairs.push({ key: kStr, value: vStr, normKey: normalizeToken(kStr) });
  };

  // 1. Custom fields array (profile fields / vault custom fields)
  const fieldsArr = data.fields || data.customFields || data.capturedFields;
  if (Array.isArray(fieldsArr)) {
    fieldsArr.forEach(f => {
      if (f) addPair(f.name || f.label || f.key, f.value);
    });
  }

  // 2. Flat key-value map (data.values = { "Field Label": "value" })
  if (data.values && typeof data.values === 'object' && !Array.isArray(data.values)) {
    Object.entries(data.values).forEach(([k, v]) => addPair(k, v));
  }

  // 3. Note with __template__ prefix
  if (data.note && typeof data.note === 'string' && data.note.startsWith('__template__:')) {
    data.note.split('\n').slice(1).forEach(line => {
      const idx = line.indexOf(':');
      if (idx !== -1) addPair(line.substring(0, idx), line.substring(idx + 1));
    });
  }

  // 4. Username / Email / Password
  if (data.username) {
    ['username', 'user', 'email', 'login', 'handle'].forEach(k => addPair(k, data.username));
  }
  if (data.password) {
    ['password', 'passwd', 'pwd', 'pin'].forEach(k => addPair(k, data.password));
  }

  // 5. Address Data
  if (data.addressData) {
    const a = data.addressData;
    addPair('full name', a.fullName); addPair('name', a.fullName);
    addPair('street address', a.streetAddress); addPair('address', a.streetAddress);
    addPair('city', a.city); addPair('town', a.city);
    addPair('state', a.state); addPair('province', a.state);
    addPair('zip code', a.postalCode); addPair('pincode', a.postalCode); addPair('postal code', a.postalCode);
    addPair('country', a.country);
    addPair('phone', a.phone); addPair('mobile', a.phone);
    addPair('email', a.email);
  }

  // 6. Card Data
  if (data.cardData) {
    const c = data.cardData;
    addPair('card number', c.number); addPair('credit card', c.number);
    addPair('cardholder name', c.cardholderName); addPair('name on card', c.cardholderName);
    addPair('cvv', c.cvv); addPair('cvc', c.cvv); addPair('security code', c.cvv);
    if (c.expMonth && c.expYear) addPair('expiry', `${c.expMonth}/${c.expYear}`);
    addPair('exp month', c.expMonth);
    addPair('exp year', c.expYear);
  }

  // 7. Identity Data
  if (data.identityData) {
    const i = data.identityData;
    addPair('first name', i.firstName);
    addPair('last name', i.lastName);
    addPair('date of birth', i.dateOfBirth); addPair('dob', i.dateOfBirth);
    addPair('email', i.email);
    addPair('phone', i.phone);
    addPair('ssn', i.ssn); addPair('social security', i.ssn);
    addPair('license', i.licenseNumber);
    addPair('passport', i.passportNumber);
  }

  return kvPairs;
}

// ─── Label extraction for a DOM element ────────────────────────────────────

function getElementHints(el) {
  if (!el) return '';
  const rawHints = [];

  // 1. Element own attributes
  const own = [
    el.getAttribute('aria-label'),
    el.getAttribute('placeholder'),
    el.getAttribute('title'),
    el.getAttribute('name'),
    el.getAttribute('id'),
    el.getAttribute('autocomplete'),
    el.getAttribute('data-label'),
    el.getAttribute('data-testid'),
    el.getAttribute('data-field'),
    el.getAttribute('data-fieldname'),
  ];
  own.forEach(v => { if (v && v.trim()) rawHints.push(v.trim()); });

  // 2. aria-labelledby
  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    ariaLabelledBy.split(/\s+/).forEach(id => {
      const node = document.getElementById(id);
      if (node) rawHints.push((node.innerText || node.textContent || '').trim());
    });
  }

  // 3. Explicit <label for="...">
  if (el.id) {
    try {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) rawHints.push((lbl.innerText || lbl.textContent || '').trim());
    } catch (e) {}
  }

  // 4. Enclosing <label>
  const encLabel = el.closest('label');
  if (encLabel) {
    const clone = encLabel.cloneNode(true);
    clone.querySelectorAll('input, select, textarea, button, script, style').forEach(n => n.remove());
    rawHints.push((clone.innerText || clone.textContent || '').trim());
  }

  // 5. Walk up to 5 parent levels, collect text from sibling nodes that come
  //    BEFORE the element (they are usually the label container)
  let curr = el;
  for (let depth = 0; depth < 5; depth++) {
    const parent = curr.parentElement;
    if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;

    // Text in siblings BEFORE this branch
    const children = Array.from(parent.children);
    const currIdx = children.indexOf(curr);
    for (let i = 0; i < currIdx; i++) {
      const sib = children[i];
      if (['SCRIPT', 'STYLE', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SVG'].includes(sib.tagName)) continue;
      const txt = (sib.innerText || sib.textContent || '').trim();
      if (txt && txt.length > 1 && txt.length < 120) rawHints.push(txt);
    }

    // Parent own text that's not inherited from child elements
    const parentClone = parent.cloneNode(false); // shallow
    Array.from(parent.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent || '').trim();
        if (t && t.length > 1) rawHints.push(t);
      }
    });

    curr = parent;
  }

  // Normalize and concatenate all hints into one searchable string
  return normalizeToken(rawHints.join(' '));
}

// ─── Score a (kvPair, elementHints) match ──────────────────────────────────

function scoreMatch(normKey, elHints) {
  if (!normKey || !elHints) return 0;

  // Perfect substring: the entire field name appears inside hints
  if (elHints.includes(normKey)) return normKey.length * 4 + 10;

  const words = normKey.split(' ').filter(w => w.length >= 2);
  if (words.length === 0) return 0;

  let matchedWords = 0;
  for (const w of words) {
    // Must match as a whole "word" (preceded / followed by space or string boundary)
    const re = new RegExp(`(^| )${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
    if (re.test(elHints)) matchedWords++;
  }

  if (matchedWords === 0) return 0;
  if (matchedWords === words.length) return matchedWords * 3 + 5; // All words matched
  if (matchedWords >= Math.ceil(words.length * 0.7)) return matchedWords * 2; // 70%+ matched
  return 0; // Partial match below 70% → reject (avoids spurious fills)
}

// ─── Main fill function ─────────────────────────────────────────────────────

function fillAllPageFields(data, scopeElement) {
  if (!scopeElement) scopeElement = document;
  const kvPairs = collectAllKeyValuePairs(data);
  if (kvPairs.length === 0) return 0;

  // Collect candidate elements
  const SELECTOR = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
    'input:not([type="image"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])',
    'select',
    'textarea',
    '[role="combobox"]',
    '[role="listbox"]',
    '[aria-haspopup="listbox"]',
    '[aria-haspopup="true"]',
    '[aria-haspopup="menu"]',
    '[contenteditable="true"]',
  ].join(', ');

  const allEls = Array.from(scopeElement.querySelectorAll(SELECTOR));

  // Filter to only visible, enabled elements
  const inputs = allEls.filter(el => {
    if (el.disabled || el.readOnly) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  });

  let filledCount = 0;
  const filledElements = new Set();

  for (const el of inputs) {
    if (filledElements.has(el)) continue;

    const type = (el.type || '').toLowerCase();

    // Password fields: only fill if we have a password key
    if (type === 'password') {
      const pwdPair = kvPairs.find(p =>
        ['password', 'passwd', 'pwd', 'pin'].includes(p.key.toLowerCase())
      );
      if (pwdPair) {
        setFieldValue(el, pwdPair.value);
        filledElements.add(el);
        filledCount++;
      }
      continue;
    }

    const elHints = getElementHints(el);

    let bestPair = null;
    let bestScore = 0;

    for (const pair of kvPairs) {
      const score = scoreMatch(pair.normKey, elHints);
      if (score > bestScore) {
        bestScore = score;
        bestPair = pair;
      }
    }

    if (bestPair && bestScore > 0) {
      setFieldValue(el, bestPair.value);
      filledElements.add(el);
      filledCount++;
    }
  }

  return filledCount;
}

// ─── Typed form fill (login / card / address) ──────────────────────────────

function fillFormFields(form, data) {
  if (form && form.fields) {
    for (const field of form.fields) {
      const el = field.element;
      const type = field.type;

      if (form.formType === 'LOGIN' || form.formType === 'REGISTRATION') {
        if ((type === 'USERNAME' || type === 'EMAIL') && data.username) setFieldValue(el, data.username);
        if ((type === 'PASSWORD' || type === 'NEW_PASSWORD') && data.password) setFieldValue(el, data.password);
      } else if (form.formType === 'CARD_PAYMENT' && data.cardData) {
        const c = data.cardData;
        if (type === 'CARD_NUMBER') setFieldValue(el, c.number || '');
        if (type === 'CARD_HOLDER') setFieldValue(el, c.cardholderName || '');
        if (type === 'CARD_CVV') setFieldValue(el, c.cvv || '');
        if (type === 'CARD_EXPIRY') setFieldValue(el, c.expMonth && c.expYear ? `${c.expMonth}/${c.expYear}` : '');
        if (type === 'CARD_EXPIRY_MONTH') setFieldValue(el, c.expMonth || '');
        if (type === 'CARD_EXPIRY_YEAR') setFieldValue(el, c.expYear || '');
      } else if (form.formType === 'ADDRESS' && data.addressData) {
        const a = data.addressData;
        if (type === 'NAME') setFieldValue(el, a.fullName || '');
        if (type === 'ADDRESS_STREET') setFieldValue(el, a.streetAddress2 ? `${a.streetAddress}, ${a.streetAddress2}` : (a.streetAddress || ''));
        if (type === 'ADDRESS_CITY') setFieldValue(el, a.city || '');
        if (type === 'ADDRESS_STATE') setFieldValue(el, a.state || '');
        if (type === 'ADDRESS_ZIP') setFieldValue(el, a.postalCode || '');
        if (type === 'ADDRESS_COUNTRY') setFieldValue(el, a.country || '');
        if (type === 'PHONE') setFieldValue(el, a.phone || '');
        if (type === 'EMAIL') setFieldValue(el, a.email || '');
      }
    }
  }

  // Always run smart fill on top of typed fill
  return fillAllPageFields(data, document);
}

// ─── Exports ───────────────────────────────────────────────────────────────
window.setFieldValue = setFieldValue;
window.fillFormFields = fillFormFields;
window.fillAllPageFields = fillAllPageFields;
