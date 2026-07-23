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
  if (matchedIdx === -1 && targetToken.length > 2) {
    matchedIdx = options.findIndex(opt => {
      const txtToken = normalizeToken(opt.text || opt.textContent);
      const words = targetToken.split(' ');
      return words.some(w => w.length > 2 && txtToken.includes(w));
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

    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    selectEl.dispatchEvent(new Event('blur', { bubbles: true }));
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

  // Handle custom combobox dropdowns (e.g. role="combobox")
  const role = element.getAttribute('role')?.toLowerCase() || '';
  if (role === 'combobox' || element.getAttribute('aria-haspopup') === 'listbox') {
    element.focus();
    try { element.click(); } catch (e) {}
  }

  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  element.focus();
  if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }

  // Dispatch events to trigger JS state updates in SPA frameworks
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
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

  // 1. Direct custom fields array (from FieldProfile or VaultItem)
  if (Array.isArray(data.fields)) {
    data.fields.forEach(f => {
      if (f && f.name && f.value) {
        kvPairs.push({ key: f.name, value: f.value });
      }
    });
  }

  // 2. Parsed template fields in note (e.g. __template__:...)
  if (data.note && typeof data.note === 'string' && data.note.startsWith('__template__:')) {
    const lines = data.note.split('\n').slice(1);
    lines.forEach(line => {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const k = line.substring(0, idx).trim();
        const v = line.substring(idx + 1).trim();
        if (k && v) kvPairs.push({ key: k, value: v });
      }
    });
  }

  // 3. Username / Email / Password
  if (data.username) {
    kvPairs.push({ key: 'username', value: data.username });
    kvPairs.push({ key: 'user', value: data.username });
    kvPairs.push({ key: 'email', value: data.username });
    kvPairs.push({ key: 'login', value: data.username });
    kvPairs.push({ key: 'handle', value: data.username });
  }
  if (data.password) {
    kvPairs.push({ key: 'password', value: data.password });
    kvPairs.push({ key: 'passwd', value: data.password });
    kvPairs.push({ key: 'pwd', value: data.password });
    kvPairs.push({ key: 'pin', value: data.password });
  }

  // 4. Address Data
  if (data.addressData) {
    const a = data.addressData;
    if (a.fullName) kvPairs.push({ key: 'full name', value: a.fullName }, { key: 'name', value: a.fullName });
    if (a.streetAddress) kvPairs.push({ key: 'street address', value: a.streetAddress }, { key: 'address', value: a.streetAddress });
    if (a.city) kvPairs.push({ key: 'city', value: a.city }, { key: 'town', value: a.city });
    if (a.state) kvPairs.push({ key: 'state', value: a.state }, { key: 'province', value: a.state });
    if (a.postalCode) kvPairs.push({ key: 'zip code', value: a.postalCode }, { key: 'pincode', value: a.postalCode }, { key: 'postal code', value: a.postalCode });
    if (a.country) kvPairs.push({ key: 'country', value: a.country });
    if (a.phone) kvPairs.push({ key: 'phone', value: a.phone }, { key: 'mobile', value: a.phone });
    if (a.email) kvPairs.push({ key: 'email', value: a.email });
  }

  // 5. Card Data
  if (data.cardData) {
    const c = data.cardData;
    if (c.number) kvPairs.push({ key: 'card number', value: c.number }, { key: 'credit card', value: c.number });
    if (c.cardholderName) kvPairs.push({ key: 'cardholder name', value: c.cardholderName }, { key: 'name on card', value: c.cardholderName });
    if (c.cvv) kvPairs.push({ key: 'cvv', value: c.cvv }, { key: 'cvc', value: c.cvv }, { key: 'security code', value: c.cvv });
    if (c.expMonth && c.expYear) kvPairs.push({ key: 'expiry', value: `${c.expMonth}/${c.expYear}` });
    if (c.expMonth) kvPairs.push({ key: 'exp month', value: c.expMonth });
    if (c.expYear) kvPairs.push({ key: 'exp year', value: c.expYear });
  }

  // 6. Identity Data
  if (data.identityData) {
    const i = data.identityData;
    if (i.firstName) kvPairs.push({ key: 'first name', value: i.firstName });
    if (i.lastName) kvPairs.push({ key: 'last name', value: i.lastName });
    if (i.dateOfBirth) kvPairs.push({ key: 'date of birth', value: i.dateOfBirth }, { key: 'dob', value: i.dateOfBirth });
    if (i.email) kvPairs.push({ key: 'email', value: i.email });
    if (i.phone) kvPairs.push({ key: 'phone', value: i.phone });
    if (i.ssn) kvPairs.push({ key: 'ssn', value: i.ssn }, { key: 'social security', value: i.ssn });
    if (i.licenseNumber) kvPairs.push({ key: 'license', value: i.licenseNumber });
    if (i.passportNumber) kvPairs.push({ key: 'passport', value: i.passportNumber });
  }

  return kvPairs;
}

function getElementHints(el) {
  if (!el) return '';
  const hints = [];
  if (el.name) hints.push(el.name);
  if (el.id) hints.push(el.id);
  if (el.placeholder) hints.push(el.placeholder);
  if (el.getAttribute('aria-label')) hints.push(el.getAttribute('aria-label'));
  if (el.getAttribute('autocomplete')) hints.push(el.getAttribute('autocomplete'));

  if (el.id) {
    try {
      const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelEl && labelEl.innerText) hints.push(labelEl.innerText);
    } catch (e) {}
  }
  const parentLabel = el.closest('label');
  if (parentLabel && parentLabel.innerText) hints.push(parentLabel.innerText);

  const prevSibling = el.previousElementSibling;
  if (prevSibling && prevSibling.innerText) hints.push(prevSibling.innerText);

  return normalizeToken(hints.join(' '));
}

function fillAllPageFields(data, scopeElement = document) {
  const kvPairs = collectAllKeyValuePairs(data);
  if (kvPairs.length === 0) return 0;

  const inputs = scopeElement.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]), select, textarea, [role="combobox"]');
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

    // 2. Fuzzy match key against input hints
    let bestMatch = null;
    let bestScore = 0;

    for (const pair of kvPairs) {
      if (!pair.value) continue;
      const normKey = normalizeToken(pair.key);
      if (!normKey) continue;

      if (elHints.includes(normKey)) {
        const score = normKey.length * 2;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = pair;
        }
      } else {
        const keyWords = normKey.split(' ').filter(w => w.length > 2);
        let matchWords = 0;
        keyWords.forEach(w => {
          if (elHints.includes(w)) matchWords++;
        });
        if (matchWords > 0) {
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
  // First run typed form fill (login/card/address)
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

  // Then run smart all-field match for custom fields & profiles!
  return fillAllPageFields(data, (form && form.element) ? form.element : document);
}

window.setFieldValue = setFieldValue;
window.fillFormFields = fillFormFields;
window.fillAllPageFields = fillAllPageFields;
