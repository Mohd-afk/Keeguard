// content/fill-engine.js

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

  // 2. Case-insensitive substring or token match
  if (matchedIdx === -1) {
    matchedIdx = options.findIndex(opt => {
      const valToken = normalizeToken(opt.value);
      const txtToken = normalizeToken(opt.text || opt.textContent);
      return valToken.includes(targetToken) || targetToken.includes(valToken) ||
             txtToken.includes(targetToken) || targetToken.includes(txtToken);
    });
  }

  // 3. Word match fallback
  if (matchedIdx === -1 && targetToken.length >= 2) {
    matchedIdx = options.findIndex(opt => {
      const txtToken = normalizeToken(opt.text || opt.textContent);
      const words = targetToken.split(' ');
      return words.some(w => w.length >= 2 && txtToken.includes(w));
    });
  }

  if (matchedIdx !== -1) {
    selectEl.focus();
    selectEl.selectedIndex = matchedIdx;
    options[matchedIdx].selected = true;

    try {
      const selectSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype, 'value'
      )?.set;
      if (selectSetter) {
        selectSetter.call(selectEl, options[matchedIdx].value);
      } else {
        selectEl.value = options[matchedIdx].value;
      }
    } catch (e) {
      selectEl.value = options[matchedIdx].value;
    }

    selectEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    selectEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    selectEl.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
    return true;
  }

  return false;
}

function setFieldValue(element, value) {
  if (!element || value === undefined || value === null) return;

  if (element.tagName === 'SELECT') {
    setSelectValue(element, value);
    return;
  }

  const role = element.getAttribute('role')?.toLowerCase() || '';
  const ariaHasPopup = element.getAttribute('aria-haspopup')?.toLowerCase() || '';
  const isCustomDropdown = role === 'combobox' || role === 'listbox' || ariaHasPopup === 'listbox' || ariaHasPopup === 'true' || element.classList.contains('select') || !!element.closest('[class*="select"]');

  // Handle standard text inputs & textareas
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    element.focus();

    // React 16+ _valueTracker workaround
    const tracker = element._valueTracker;
    if (tracker) {
      tracker.setValue(element.value);
    }

    const valueSetter = Object.getOwnPropertyDescriptor(
      element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));

    // If this input is also a custom combobox/dropdown trigger, open and select option
    if (isCustomDropdown) {
      try { element.click(); } catch (e) {}
      triggerCustomDropdownSelect(value);
    }
    return;
  }

  // Handle custom div/span dropdown elements
  if (isCustomDropdown) {
    element.focus();
    try { element.click(); } catch (e) {}
    triggerCustomDropdownSelect(value);
  }
}

function triggerCustomDropdownSelect(value) {
  setTimeout(() => {
    const targetToken = normalizeToken(String(value));
    if (!targetToken) return;

    const selector = '[role="option"], .select-option, .dropdown-item, li[class*="option"], div[class*="option"], div[class*="select-dropdown"] div, div[class*="menu-item"]';
    const options = document.querySelectorAll(selector);

    for (const opt of options) {
      const optText = normalizeToken(opt.innerText || opt.textContent || '');
      if (optText && (optText === targetToken || optText.includes(targetToken) || targetToken.includes(optText))) {
        try {
          opt.focus();
          opt.click();
        } catch (e) {}
        break;
      }
    }
  }, 150);
}

function normalizeToken(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectAllKeyValuePairs(data) {
  const kvPairs = [];
  if (!data) return kvPairs;

  const addPair = (k, v) => {
    if (k && v !== undefined && v !== null && String(v).trim() !== '') {
      kvPairs.push({ key: String(k).trim(), value: String(v).trim() });
    }
  };

  // 1. Direct fields array (e.g. [{ name: '...', value: '...' }] or [{ label: '...', value: '...' }])
  const fieldsArr = data.fields || data.customFields || data.capturedFields;
  if (Array.isArray(fieldsArr)) {
    fieldsArr.forEach(f => {
      if (f) {
        addPair(f.name || f.label || f.key, f.value);
      }
    });
  }

  // 2. Direct object key-values (e.g. data.values = { "Net Weight": "450" })
  if (data.values && typeof data.values === 'object') {
    Object.entries(data.values).forEach(([k, v]) => addPair(k, v));
  }

  // 3. Parsed template fields in note (e.g. __template__:...)
  if (data.note && typeof data.note === 'string' && data.note.startsWith('__template__:')) {
    const lines = data.note.split('\n').slice(1);
    lines.forEach(line => {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        addPair(line.substring(0, idx), line.substring(idx + 1));
      }
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
    addPair('cvv', c.cvv); addPair('security code', c.cvv);
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

function getElementHints(el) {
  if (!el) return '';
  const hints = [];

  // Attributes
  if (el.name) hints.push(el.name);
  if (el.id) hints.push(el.id);
  if (el.placeholder) hints.push(el.placeholder);
  if (el.getAttribute('aria-label')) hints.push(el.getAttribute('aria-label'));
  if (el.getAttribute('autocomplete')) hints.push(el.getAttribute('autocomplete'));
  if (el.getAttribute('title')) hints.push(el.getAttribute('title'));

  // Data attributes
  ['data-label', 'data-fieldname', 'data-name', 'data-id', 'data-testid', 'data-placeholder'].forEach(attr => {
    const val = el.getAttribute(attr);
    if (val) hints.push(val);
  });

  // 1. Explicit aria-labelledby
  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    ariaLabelledBy.split(/\s+/).forEach(id => {
      const lblNode = document.getElementById(id);
      if (lblNode && (lblNode.innerText || lblNode.textContent)) {
        hints.push(lblNode.innerText || lblNode.textContent);
      }
    });
  }

  // 2. Explicit label[for="id"]
  if (el.id) {
    try {
      const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelEl && (labelEl.innerText || labelEl.textContent)) {
        hints.push(labelEl.innerText || labelEl.textContent);
      }
    } catch (e) {}
  }

  // 3. Parent label
  const parentLabel = el.closest('label');
  if (parentLabel && (parentLabel.innerText || parentLabel.textContent)) {
    hints.push(parentLabel.innerText || parentLabel.textContent);
  }

  // 4. Preceding siblings
  let prev = el.previousElementSibling;
  let count = 0;
  while (prev && count < 3) {
    const txt = (prev.innerText || prev.textContent || '').trim();
    if (txt && txt.length < 100) hints.push(txt);
    prev = prev.previousElementSibling;
    count++;
  }

  // 5. Ancestor container text extraction (for React / SPA forms like Meesho)
  let curr = el.parentElement;
  let depth = 0;
  while (curr && depth < 4) {
    const isContainer = curr.matches('[class*="field"], [class*="form"], [class*="item"], [class*="group"], [class*="input"], [class*="row"], [class*="col"], td, th, div');
    if (isContainer) {
      try {
        const clone = curr.cloneNode(true);
        clone.querySelectorAll('input, select, textarea, button, script, style, [role="combobox"]').forEach(n => n.remove());
        const text = (clone.innerText || clone.textContent || '').trim();
        if (text && text.length < 150) {
          hints.push(text);
        }
      } catch (e) {}
    }
    curr = curr.parentElement;
    depth++;
  }

  return normalizeToken(hints.join(' '));
}

function fillAllPageFields(data, scopeElement = document) {
  const kvPairs = collectAllKeyValuePairs(data);
  if (kvPairs.length === 0) return 0;

  const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="file"]), select, textarea, [role="combobox"], [role="listbox"], [aria-haspopup="listbox"], [aria-haspopup="true"], [class*="select"]';
  const inputs = scopeElement.querySelectorAll(selector);
  let filledCount = 0;
  const filledElements = new Set();

  inputs.forEach(el => {
    if (filledElements.has(el) || el.disabled || el.readOnly) return;

    const elHints = getElementHints(el);
    const type = (el.type || '').toLowerCase();

    // 1. Password field special handling
    if (type === 'password') {
      const pwdPair = kvPairs.find(p => p.key === 'password' || p.key === 'passwd' || p.key === 'pwd' || p.key === 'pin');
      if (pwdPair && pwdPair.value) {
        setFieldValue(el, pwdPair.value);
        filledElements.add(el);
        filledCount++;
        return;
      }
    }

    // 2. Match key against input hints
    let bestMatch = null;
    let bestScore = 0;

    for (const pair of kvPairs) {
      if (pair.value === undefined || pair.value === null || String(pair.value).trim() === '') continue;
      const normKey = normalizeToken(pair.key);
      if (!normKey) continue;

      if (elHints.includes(normKey)) {
        const score = normKey.length * 3;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = pair;
        }
      } else {
        const keyWords = normKey.split(' ').filter(w => w.length >= 2);
        let matchWords = 0;
        keyWords.forEach(w => {
          if (elHints.includes(w)) matchWords++;
        });
        if (matchWords > 0 && matchWords === keyWords.length) {
          const score = matchWords * 2;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = pair;
          }
        } else if (matchWords > 0) {
          const score = matchWords;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = pair;
          }
        }
      }
    }

    if (bestMatch && bestScore > 0) {
      setFieldValue(el, bestMatch.value);
      filledElements.add(el);
      filledCount++;
    }
  });

  return filledCount;
}

function fillFormFields(form, data) {
  if (form && form.fields) {
    const fields = form.fields;
    for (const field of fields) {
      const el = field.element;
      const type = field.type;

      if (form.formType === 'LOGIN' || form.formType === 'REGISTRATION') {
        if ((type === 'USERNAME' || type === 'EMAIL') && data.username) {
          setFieldValue(el, data.username);
        }
        if ((type === 'PASSWORD' || type === 'NEW_PASSWORD') && data.password) {
          setFieldValue(el, data.password);
        }
      } else if (form.formType === 'CARD_PAYMENT' && data.cardData) {
        const card = data.cardData;
        if (type === 'CARD_NUMBER') setFieldValue(el, card.number || '');
        if (type === 'CARD_HOLDER') setFieldValue(el, card.cardholderName || '');
        if (type === 'CARD_CVV') setFieldValue(el, card.cvv || '');
        if (type === 'CARD_EXPIRY') {
          const exp = card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear}` : '';
          setFieldValue(el, exp);
        }
        if (type === 'CARD_EXPIRY_MONTH') setFieldValue(el, card.expMonth || '');
        if (type === 'CARD_EXPIRY_YEAR') setFieldValue(el, card.expYear || '');
      } else if (form.formType === 'ADDRESS' && data.addressData) {
        const addr = data.addressData;
        if (type === 'NAME') setFieldValue(el, addr.fullName || '');
        if (type === 'ADDRESS_STREET') {
          const fullStreet = addr.streetAddress2 ? `${addr.streetAddress}, ${addr.streetAddress2}` : (addr.streetAddress || '');
          setFieldValue(el, fullStreet);
        }
        if (type === 'ADDRESS_CITY') setFieldValue(el, addr.city || '');
        if (type === 'ADDRESS_STATE') setFieldValue(el, addr.state || '');
        if (type === 'ADDRESS_ZIP') setFieldValue(el, addr.postalCode || '');
        if (type === 'ADDRESS_COUNTRY') setFieldValue(el, addr.country || '');
        if (type === 'PHONE') setFieldValue(el, addr.phone || '');
        if (type === 'EMAIL') setFieldValue(el, addr.email || '');
      }
    }
  }

  return fillAllPageFields(data, document);
}

window.setFieldValue = setFieldValue;
window.fillFormFields = fillFormFields;
window.fillAllPageFields = fillAllPageFields;

