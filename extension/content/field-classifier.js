// PURPOSE: Browser extension content script managing DOM field-classifier.
// content/field-classifier.js

const USERNAME_KEYWORDS = ['user', 'username', 'email', 'e-mail', 'login', 'account', 'identifier', 'phone', 'mobile', 'uname', 'userid'];
const PASSWORD_KEYWORDS = ['password', 'passwd', 'pass', 'secret', 'pin', 'pwd', 'pswd'];
const NEW_PASSWORD_KEYWORDS = ['new', 'create', 'confirm', 'repeat', 'retype'];
const CARD_NUM_KEYWORDS = ['card number', 'card_number', 'ccnum', 'creditcard', 'cardno', 'pan', 'cardnum'];
const CARD_CVV_KEYWORDS = ['cvv', 'cvc', 'security code', 'security_code', 'csc'];
const CARD_HOLDER_KEYWORDS = ['cardholder', 'card holder', 'ccname', 'owner'];
const CARD_EXP_KEYWORDS = ['expiry', 'exp date', 'exp_date', 'expiration'];
const STREET_KEYWORDS = ['street', 'address line', 'address_line', 'addr1', 'address1', 'billing address', 'shipping address'];
const CITY_KEYWORDS = ['city', 'locality', 'town'];
const STATE_KEYWORDS = ['state', 'province', 'region'];
const ZIP_KEYWORDS = ['zip', 'postal', 'pincode', 'postcode'];
const COUNTRY_KEYWORDS = ['country'];
const PHONE_KEYWORDS = ['phone', 'mobile', 'telephone', 'tel number', 'tel'];
const NAME_KEYWORDS = ['full name', 'firstname', 'lastname', 'name'];

function classifyField(input) {
  const ac = input.getAttribute('autocomplete')?.toLowerCase() || '';
  const type = input.type?.toLowerCase() || 'text';
  const name = input.name?.toLowerCase() || '';
  const id = input.id?.toLowerCase() || '';
  const placeholder = input.placeholder?.toLowerCase() || '';
  
  // Combine all names and ids for fuzzy match
  const combined = `${name} ${id} ${placeholder}`.trim();

  // 1. Check autocomplete hints
  if (ac.includes('username')) return 'USERNAME';
  if (ac.includes('email')) return 'EMAIL';
  if (ac.includes('new-password')) return 'NEW_PASSWORD';
  if (ac.includes('current-password')) return 'PASSWORD';
  if (ac.includes('cc-number')) return 'CARD_NUMBER';
  if (ac.includes('cc-exp')) return 'CARD_EXPIRY';
  if (ac.includes('cc-csc') || ac.includes('cc-cvv')) return 'CARD_CVV';
  if (ac.includes('cc-name')) return 'CARD_HOLDER';
  if (ac.includes('street-address') || ac.includes('address-line1')) return 'ADDRESS_STREET';
  if (ac.includes('address-level2') || ac.includes('locality')) return 'ADDRESS_CITY';
  if (ac.includes('address-level1') || ac.includes('region')) return 'ADDRESS_STATE';
  if (ac.includes('postal-code')) return 'ADDRESS_ZIP';
  if (ac.includes('country')) return 'ADDRESS_COUNTRY';
  if (ac.includes('tel') || ac.includes('phone')) return 'PHONE';
  if (ac.includes('name')) return 'NAME';

  // 2. Check input type
  if (type === 'password') {
    return NEW_PASSWORD_KEYWORDS.some(k => combined.includes(k)) ? 'NEW_PASSWORD' : 'PASSWORD';
  }
  if (type === 'email') return 'EMAIL';
  if (type === 'tel') return 'PHONE';

  // 3. Fallback to keyword matching
  if (CARD_NUM_KEYWORDS.some(k => combined.includes(k))) return 'CARD_NUMBER';
  if (CARD_CVV_KEYWORDS.some(k => combined.includes(k))) return 'CARD_CVV';
  if (CARD_EXP_KEYWORDS.some(k => combined.includes(k))) return 'CARD_EXPIRY';
  if (CARD_HOLDER_KEYWORDS.some(k => combined.includes(k))) return 'CARD_HOLDER';

  if (STREET_KEYWORDS.some(k => combined.includes(k))) return 'ADDRESS_STREET';
  if (CITY_KEYWORDS.some(k => combined.includes(k))) return 'ADDRESS_CITY';
  if (STATE_KEYWORDS.some(k => combined.includes(k))) return 'ADDRESS_STATE';
  if (ZIP_KEYWORDS.some(k => combined.includes(k))) return 'ADDRESS_ZIP';
  if (COUNTRY_KEYWORDS.some(k => combined.includes(k))) return 'ADDRESS_COUNTRY';

  if (PHONE_KEYWORDS.some(k => combined.includes(k))) return 'PHONE';
  if (NAME_KEYWORDS.some(k => combined.includes(k))) {
    if (!combined.includes('card') && !combined.includes('user')) return 'NAME';
  }

  if (PASSWORD_KEYWORDS.some(k => combined.includes(k))) {
    return NEW_PASSWORD_KEYWORDS.some(k => combined.includes(k)) ? 'NEW_PASSWORD' : 'PASSWORD';
  }

  if (USERNAME_KEYWORDS.some(k => combined.includes(k))) {
    return combined.includes('email') ? 'EMAIL' : 'USERNAME';
  }

  return 'UNKNOWN';
}
window.classifyField = classifyField;
