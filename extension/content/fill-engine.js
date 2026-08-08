// content/fill-engine.js
// v5.0.7 – Fix selector split bug, add debug logging, fix readOnly skip, fix scoreMatch

// ─── Utilities ─────────────────────────────────────────────────────────────

function normalizeToken(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Tag / Chip input detection ────────────────────────────────────────────
// Inputs where pressing Enter/comma creates a chip/pill/tag.
// Examples: Flipkart Search Keywords, Key Features, etc.

const TAG_INPUT_CHIP_SELECTORS = [
  '[class*="chip"]',
  '[class*="tag"]:not(input)',
  '[class*="pill"]',
  '[class*="Token"]',
  '[class*="badge"]',
  '[class*="MultiValue"]',
  '[class*="multi-value"]',
  '[class*="react-tagsinput-tag"]',
  '[class*="input-tag"]',
  '[class*="keyword"]',
].join(', ');

/** Returns true if the given input element lives inside a tag/chip container. */
function isTagInput(el) {
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return false;
  let parent = el.parentElement;
  for (let d = 0; d < 5 && parent && parent.tagName !== 'BODY'; d++) {
    if (parent.querySelector(TAG_INPUT_CHIP_SELECTORS)) return true;
    const hint = (parent.innerText || parent.textContent || '').toLowerCase();
    if (
      hint.includes('press enter') ||
      hint.includes('after each value') ||
      hint.includes('press ","') ||
      hint.includes('press comma')
    ) return true;
    const cls = (parent.className || '').toLowerCase();
    if (
      cls.includes('tag') || cls.includes('chip') || cls.includes('pill') ||
      cls.includes('token') || cls.includes('multiinput') ||
      cls.includes('multi-input') || cls.includes('tagsinput')
    ) return true;
    parent = parent.parentElement;
  }
  return false;
}

/** Reads all existing chip/tag texts from the container of a tag input. */
function readTagInputValues(el) {
  const chips = [];
  let parent = el.parentElement;
  for (let d = 0; d < 5 && parent && parent.tagName !== 'BODY'; d++) {
    const found = parent.querySelectorAll(TAG_INPUT_CHIP_SELECTORS);
    if (found.length > 0) {
      found.forEach(chip => {
        const clone = chip.cloneNode(true);
        clone.querySelectorAll('button, [aria-label*="remove"], [aria-label*="delete"], [title*="remove"], svg').forEach(n => n.remove());
        const txt = (clone.innerText || clone.textContent || '').trim();
        if (txt && txt.length > 0) chips.push(txt);
      });
      break;
    }
    parent = parent.parentElement;
  }
  return chips;
}

// ─── Native SELECT fill ─────────────────────────────────────────────────────

function setSelectValue(selectEl, value) {
  if (!selectEl || selectEl.tagName !== 'SELECT') return false;
  const targetVal = String(value).trim().toLowerCase();
  const targetToken = normalizeToken(targetVal);
  const options = Array.from(selectEl.options || []);
  if (options.length === 0) return false;

  let matchedIdx = -1;

  // 1. Exact value or text match
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

  // If selectEl is wrapped inside or next to a custom dropdown UI, try to update label display
  const container = selectEl.closest('[class*="select"], [class*="Select"], [class*="dropdown"], [class*="Dropdown"]') || selectEl.parentElement;
  if (container && container !== selectEl) {
    try {
      const selTxt = options[matchedIdx].text || options[matchedIdx].textContent;
      const valSpan = container.querySelector('[class*="value"], [class*="rendered"], [class*="selection"], [class*="label"]');
      if (valSpan && selTxt) valSpan.textContent = selTxt;
    } catch (e) {}
  }

  return true;
}

// ─── React / SPA input fill ─────────────────────────────────────────────────

function setInputValue(element, value) {
  if (!element || value === undefined || value === null) return;
  let strVal = String(value).trim();

  // If element is type="number", sanitize value to numeric string to prevent DOMException
  if (element.type === 'number') {
    const numMatch = strVal.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (numMatch) {
      strVal = numMatch[0];
    } else {
      // Cannot parse non-numeric text into a number input
      return;
    }
  }

  try { element.focus(); } catch (e) {}

  // React 16+ internal tracker
  try {
    const tracker = element._valueTracker;
    if (tracker) tracker.setValue(element.value);
  } catch (e) {}

  try {
    const proto = element.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(element, strVal);
    else element.value = strVal;
  } catch (e) {
    try { element.value = strVal; } catch (err) {}
  }

  ['input', 'change', 'blur'].forEach(evType => {
    try {
      element.dispatchEvent(new Event(evType, { bubbles: true, composed: true }));
    } catch (e) {}
  });
  // Also fire keydown/keyup for Angular / Vue
  ['keydown', 'keyup'].forEach(evType => {
    try {
      element.dispatchEvent(new KeyboardEvent(evType, { bubbles: true, composed: true }));
    } catch (e) {}
  });
}

// ─── Custom dropdown (React/SPA) fill ──────────────────────────────────────

/**
 * Attempts to open a custom dropdown element and pick the right option.
 * Uses a polling loop (up to ~2 seconds) waiting for dropdown options to appear.
 */
function openDropdownEvents(el) {
  if (!el) return;
  try { el.focus(); } catch (e) {}
  ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
    try {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    } catch (e) {}
  });
  ['keydown', 'keyup'].forEach(type => {
    try {
      el.dispatchEvent(new KeyboardEvent(type, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
    } catch (e) {}
  });
}

function fillCustomDropdown(triggerElement, value) {
  const targetToken = normalizeToken(String(value));
  if (!targetToken) return;

  // Open dropdown on trigger and parent container
  openDropdownEvents(triggerElement);
  const container = triggerElement.closest('[role="combobox"], [role="listbox"], [aria-haspopup], [class*="select"], [class*="Select"], [class*="dropdown"], [class*="Dropdown"]');
  if (container && container !== triggerElement) {
    openDropdownEvents(container);
  }

  // If triggerElement is an INPUT or TEXTAREA, type target value to trigger search filtering
  if (triggerElement.tagName === 'INPUT' || triggerElement.tagName === 'TEXTAREA') {
    try {
      const tracker = triggerElement._valueTracker;
      if (tracker) tracker.setValue(triggerElement.value);
      const proto = triggerElement.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(triggerElement, String(value));
      else triggerElement.value = String(value);

      ['input', 'change'].forEach(evType =>
        triggerElement.dispatchEvent(new Event(evType, { bubbles: true, composed: true }))
      );
    } catch (e) {}
  }

  let attempts = 0;
  const maxAttempts = 16; // 16 x 120ms = ~2s

  function tryPickOption() {
    attempts++;
    const optionSelector = [
      '[role="option"]',
      '[role="menuitem"]',
      '[role="listitem"]',
      '.select__option',
      '.Select-option',
      '.dropdown-item',
      '.ant-select-item-option',
      '.MuiMenuItem-root',
      '.mat-option',
      'li[class*="option"]',
      'li[class*="item"]',
      'div[class*="option"]:not([class*="container"]):not([class*="wrapper"])',
      'div[class*="menu-item"]',
      'div[class*="MenuItem"]',
      'div[class*="selectOption"]',
      'div[class*="SelectItem"]',
      'div[class*="item"]',
      'span[class*="option"]',
      'span[class*="item"]',
    ].join(', ');

    const options = document.querySelectorAll(optionSelector);
    let picked = false;

    for (const opt of options) {
      const rect = opt.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const optText = normalizeToken(opt.innerText || opt.textContent || '');
      if (!optText) continue;

      if (optText === targetToken ||
          optText.includes(targetToken) ||
          targetToken.includes(optText)) {
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
          try {
            opt.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          } catch (e) {}
        });
        picked = true;
        break;
      }
    }

    if (!picked && attempts < maxAttempts) {
      setTimeout(tryPickOption, 120);
    } else if (!picked) {
      // Fallback: press Enter on input in case search filtering highlighted the item
      try {
        ['keydown', 'keypress', 'keyup'].forEach(evType => {
          triggerElement.dispatchEvent(new KeyboardEvent(evType, {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true, cancelable: true
          }));
        });
      } catch(e){}
    }
  }

  setTimeout(tryPickOption, 100);
}

// ─── Tag / Chip input fill ─────────────────────────────────────────────────

/**
 * Fills a tag/chip input by typing each comma-separated value and pressing Enter.
 */
function fillTagInput(inputEl, value) {
  if (!inputEl || !value) return;

  const tags = String(value)
    .split(/[,\n]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  if (tags.length === 0) return;

  const existingTags = readTagInputValues(inputEl).map(t => t.toLowerCase());
  const newTags = tags.filter(t => !existingTags.includes(t.toLowerCase()));
  if (newTags.length === 0) return;

  inputEl.focus();
  let i = 0;

  function typeNextTag() {
    if (i >= newTags.length) return;
    const tag = newTags[i++];

    const tracker = inputEl._valueTracker;
    if (tracker) tracker.setValue(inputEl.value);

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(inputEl, tag);
    else inputEl.value = tag;

    inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

    ['keydown', 'keypress', 'keyup'].forEach(evType => {
      inputEl.dispatchEvent(new KeyboardEvent(evType, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, composed: true, cancelable: true,
      }));
    });

    setTimeout(typeNextTag, 200);
  }

  typeNextTag();
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
  const className = (element.className || '').toString().toLowerCase();

  const isDropdownTrigger =
    role === 'combobox' ||
    role === 'listbox' ||
    role === 'select' ||
    ariaHasPopup === 'listbox' ||
    ariaHasPopup === 'true' ||
    ariaHasPopup === 'menu' ||
    className.includes('select') ||
    className.includes('dropdown');

  // Standard input / textarea
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    if (isTagInput(element)) {
      fillTagInput(element, strValue);
      return;
    }
    setInputValue(element, strValue);
    if (isDropdownTrigger) fillCustomDropdown(element, strValue);
    return;
  }

  // Pure custom dropdown trigger (div/span/button with role or dropdown class)
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
    if (seen.has(key)) return;
    seen.add(key);
    kvPairs.push({ key: kStr, value: vStr, normKey: normalizeToken(kStr) });
  };

  // 1. Custom fields array (profile fields / vault custom fields)
  const fieldsArr = data.fields || data.customFields || data.capturedFields;
  if (Array.isArray(fieldsArr)) {
    fieldsArr.forEach(f => {
      if (f) {
        const k = f.name || f.label || f.key;
        const v = f.value;
        if (!k) return;
        const kStr = String(k).trim();
        const vStr = v !== undefined && v !== null ? String(v).trim() : '';
        if (!kStr || !vStr) return;
        const key = kStr.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        kvPairs.push({
          key: kStr,
          value: vStr,
          normKey: normalizeToken(kStr),
          pageIndex: typeof f.pageIndex === 'number' ? f.pageIndex : null,
          tagInput: f.tagInput || f.type === 'tagInput' || false,
        });
      }
    });
  }

  // 2. Flat key-value map
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

  // 4. Username / Email / Password (vault credentials)
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
  [
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
  ].forEach(v => { if (v && v.trim()) rawHints.push(v.trim()); });

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

  // 5. Walk up to 5 parent levels, collect text from preceding siblings
  let curr = el;
  for (let depth = 0; depth < 5; depth++) {
    const parent = curr.parentElement;
    if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;

    const children = Array.from(parent.children);
    const currIdx = children.indexOf(curr);
    for (let i = 0; i < currIdx; i++) {
      const sib = children[i];
      if (['SCRIPT', 'STYLE', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SVG'].includes(sib.tagName)) continue;
      const txt = (sib.innerText || sib.textContent || '').trim();
      if (txt && txt.length > 1 && txt.length < 120) rawHints.push(txt);
    }

    // Direct text nodes of parent
    Array.from(parent.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent || '').trim();
        if (t && t.length > 1) rawHints.push(t);
      }
    });

    curr = parent;
  }

  return normalizeToken(rawHints.join(' '));
}

// ─── Score a (kvPair, elementHints) match ──────────────────────────────────

function scoreMatch(normKey, elHints, el, pair) {
  if (!normKey || !elHints) return 0;

  // Ignore default fallback label keys like "field 1 text" when matching by label
  if (/^field\s+\d+(\s*\(?[a-z0-9]+\)?)?$/i.test(normKey)) return 0;

  // Type safety: don't match non-numeric text values (like brand names) to number inputs
  if (el && el.type === 'number' && pair && pair.value) {
    if (!/\d/.test(String(pair.value))) return 0;
  }

  // 1. Exact string match or full substring match
  if (elHints === normKey) return normKey.length * 5 + 20;
  if (elHints.includes(normKey)) return normKey.length * 4 + 10;
  if (normKey.includes(elHints) && elHints.length >= 4) return elHints.length * 3 + 5;

  // 2. Word-level matching
  const keyWords = normKey.split(' ').filter(w => w.length >= 2);
  if (keyWords.length === 0) return 0;

  const hintWords = elHints.split(' ').filter(w => w.length >= 2);
  let matchedCount = 0;

  for (const kw of keyWords) {
    if (hintWords.includes(kw)) {
      matchedCount++;
    }
  }

  if (matchedCount === 0) return 0;

  // All words matched
  if (matchedCount === keyWords.length) {
    return matchedCount * 4 + 10;
  }

  // 60%+ words matched
  if (matchedCount / keyWords.length >= 0.6) {
    return matchedCount * 2 + 2;
  }

  return 0;
}

// ─── Positional field name detection ───────────────────────────────────────

/**
 * Returns true if 60%+ of kvPair keys are positional fallbacks like "Field 4 (TEXT)",
 * OR if most fields have numeric pageIndex stored (reliable positional data).
 */
function isPositionalProfile(kvPairs) {
  if (!kvPairs.length) return false;
  // If fields have explicit pageIndex stored, always use positional strategy
  const withPageIndex = kvPairs.filter(p => p.pageIndex !== null && p.pageIndex !== undefined).length;
  if (withPageIndex >= Math.ceil(kvPairs.length * 0.6)) return true;
  // Otherwise detect from fallback label pattern
  const positionalPattern = /^field\s+\d+(\s*\(?(text|number|select|textarea|email|tel|url|password)?\)?)?$/i;
  const positionalCount = kvPairs.filter(p => positionalPattern.test(p.key.trim())).length;
  return positionalCount >= Math.ceil(kvPairs.length * 0.6);
}

/** Extract the original capture index from a name like "Field 4 (TEXT)" -> 4 */
function extractFieldIndex(fieldName) {
  const m = String(fieldName).match(/^field\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Main fill function ─────────────────────────────────────────────────────

function doFillAllPageFields(data, scopeElement) {
  if (!scopeElement) scopeElement = document;
  const kvPairs = collectAllKeyValuePairs(data);

  console.log('[KeeGuard] fillAllPageFields - kvPairs count:', kvPairs.length, kvPairs.map(p => p.key));

  if (kvPairs.length === 0) return 0;

  const FILL_SELECTOR = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), select, textarea, [role="combobox"], [role="listbox"], [aria-haspopup="listbox"], [aria-haspopup="true"], [aria-haspopup="menu"], [contenteditable="true"]';

  // ─── Collect elements: normal DOM + shadow DOM pierce ──────────────────────
  const collected = [];

  function collectFromNode(root) {
    try {
      const els = Array.from(root.querySelectorAll(FILL_SELECTOR));
      collected.push(...els);
      // Pierce shadow roots recursively
      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) collectFromNode(el.shadowRoot);
      });
    } catch (e) {}
  }

  collectFromNode(scopeElement);

  // Debug: log raw counts BEFORE filtering
  const rawCount = collected.length;
  console.log('[KeeGuard] Raw elements from querySelectorAll (incl. shadow):', rawCount);
  if (rawCount === 0) {
    // Help diagnose: is this an iframe context?
    console.log('[KeeGuard] frameContext:', {
      isTopFrame: window === window.top,
      location: window.location.href,
      bodyChildCount: document.body ? document.body.children.length : 'no body',
      allInputs: document.querySelectorAll('input').length,
      allSelects: document.querySelectorAll('select').length,
      allTextareas: document.querySelectorAll('textarea').length,
      allWithRole: document.querySelectorAll('[role]').length,
    });
  }

  // Deduplicate
  const uniqueEls = [...new Set(collected)];

  // Filter to only visible elements
  const inputs = uniqueEls.filter(el => {
    if (el.disabled) return false;
    if (el.tagName === 'SELECT') return true; // ALWAYS include native <select> elements even if styled hidden
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  });

  console.log('[KeeGuard] fillAllPageFields - visible inputs found:', inputs.length);
  if (inputs.length > 0) {
    console.log('[KeeGuard] First 5 inputs:', inputs.slice(0, 5).map(el =>
      `${el.tagName}[type=${el.type}][name=${el.name}][id=${el.id}][role=${el.getAttribute('role')}]`
    ));
  }

  let filledCount = 0;
  const filledElements = new Set();

  console.log('[KeeGuard] Running Label-Based Match Fill on', inputs.length, 'inputs');

  for (const el of inputs) {
    if (filledElements.has(el)) continue;
    const type = (el.type || '').toLowerCase();

    // Password fields
    if (type === 'password') {
      const pwdPair = kvPairs.find(p => ['password', 'passwd', 'pwd', 'pin'].includes(p.key.toLowerCase()));
      if (pwdPair) { setFieldValue(el, pwdPair.value, pwdPair); filledElements.add(el); filledCount++; }
      continue;
    }

    const elHints = getElementHints(el);
    let bestPair = null;
    let bestScore = 0;

    for (const pair of kvPairs) {
      const score = scoreMatch(pair.normKey, elHints, el, pair);
      if (score > bestScore) {
        bestScore = score;
        bestPair = pair;
      }
    }

    if (bestPair && bestScore > 0) {
      console.log(`[KeeGuard] Fill "${el.tagName}[name=${el.name || el.id || '?'}]" <- key="${bestPair.key}" score=${bestScore}`);
      setFieldValue(el, bestPair.value, bestPair);
      filledElements.add(el);
      filledCount++;
    }
  }

  console.log('[KeeGuard] fillAllPageFields - filled:', filledCount);
  return filledCount;
}

/**
 * Public entry point.
 * Retries once after 700ms if 0 inputs found (SPA lazy-rendering race).
 */
function fillAllPageFields(data, scopeElement) {
  const count = doFillAllPageFields(data, scopeElement || document);
  if (count === 0) {
    setTimeout(() => {
      const retry = doFillAllPageFields(data, document);
      console.log('[KeeGuard] Retry fill result:', retry);
    }, 700);
  }
  return count;
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

  return fillAllPageFields(data, document);
}

// ─── Exports ───────────────────────────────────────────────────────────────
window.setFieldValue = setFieldValue;
window.fillFormFields = fillFormFields;
window.fillAllPageFields = fillAllPageFields;
