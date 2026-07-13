// content/form-detector.js

function scanPageForms() {
  const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]), select'));
  
  // Group fields by their parent form element, or by nearest div container if formless
  const forms = [];
  const formMap = new Map();

  for (const input of inputs) {
    const parentForm = input.closest('form') || input.closest('div[class*="login" i], div[class*="form" i], div[id*="login" i], div[id*="form" i]') || input.parentElement;
    if (!parentForm) continue;

    if (!formMap.has(parentForm)) {
      formMap.set(parentForm, []);
    }
    formMap.get(parentForm).push(input);
  }

  for (const [formElement, formInputs] of formMap.entries()) {
    const parsedFields = [];
    let hasPassword = false;
    let hasNewPassword = false;
    let hasCard = false;
    let hasAddress = false;

    for (const input of formInputs) {
      const type = window.classifyField(input);
      if (type !== 'UNKNOWN') {
        parsedFields.push({ element: input, type });
        if (type === 'PASSWORD') hasPassword = true;
        if (type === 'NEW_PASSWORD') hasNewPassword = true;
        if (type === 'CARD_NUMBER') hasCard = true;
        if (type === 'ADDRESS_STREET') hasAddress = true;
      }
    }

    if (parsedFields.length === 0) continue;

    let formType = 'UNKNOWN';
    if (hasCard) {
      formType = 'CARD_PAYMENT';
    } else if (hasAddress) {
      formType = 'ADDRESS';
    } else if (hasNewPassword) {
      formType = 'REGISTRATION';
    } else if (hasPassword) {
      formType = 'LOGIN';
    }

    forms.push({
      element: formElement,
      fields: parsedFields,
      formType
    });
  }

  return forms;
}

window.scanPageForms = scanPageForms;
