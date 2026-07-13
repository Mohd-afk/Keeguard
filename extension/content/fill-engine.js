// content/fill-engine.js

function setFieldValue(element, value) {
  if (!element) return;

  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  const selectSetter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype, 'value'
  )?.set;

  const setter = element.tagName === 'SELECT' ? selectSetter : valueSetter;

  element.focus();
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }

  // Dispatch events to trigger JS state updates in SPA frameworks
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function fillFormFields(form, data) {
  const fields = form.fields;
  for (const field of fields) {
    const el = field.element;
    const type = field.type;

    if (form.formType === 'LOGIN' || form.formType === 'REGISTRATION') {
      if (type === 'USERNAME' || type === 'EMAIL') {
        setFieldValue(el, data.username);
      }
      if (type === 'PASSWORD' || type === 'NEW_PASSWORD') {
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

window.setFieldValue = setFieldValue;
window.fillFormFields = fillFormFields;
