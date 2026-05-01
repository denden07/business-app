export const DEFAULT_CURRENCY_CODE = 'PHP'
export const DEFAULT_DECIMAL_PLACES = 2
const STORAGE_KEY = 'app-formatting-preferences'

const supportedCurrencies = Object.freeze([
  { code: 'PHP', label: 'Philippine Peso', symbol: '₱' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'JPY', label: 'Japanese Yen', symbol: '¥' },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$' },
  { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$' },
  { code: 'MYR', label: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'THB', label: 'Thai Baht', symbol: '฿' },
  { code: 'IDR', label: 'Indonesian Rupiah', symbol: 'Rp' },
])

let cachedFormattingPreferences = null

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getSupportedCurrencies() {
  return supportedCurrencies
}

export function normalizeCurrencyCode(value) {
  const normalizedValue = String(value || DEFAULT_CURRENCY_CODE).toUpperCase()
  return supportedCurrencies.some(currency => currency.code === normalizedValue)
    ? normalizedValue
    : DEFAULT_CURRENCY_CODE
}

export function normalizeDecimalPlaces(value) {
  const numericValue = Number(value)
  if (!Number.isInteger(numericValue)) {
    return DEFAULT_DECIMAL_PLACES
  }

  return Math.min(4, Math.max(0, numericValue))
}

export function normalizeFormattingPreferences(value = {}) {
  return {
    currencyCode: normalizeCurrencyCode(value?.currencyCode),
    decimalPlaces: normalizeDecimalPlaces(value?.decimalPlaces),
  }
}

export function getFormattingPreferences() {
  if (cachedFormattingPreferences) {
    return cachedFormattingPreferences
  }

  if (canUseLocalStorage()) {
    try {
      const storedValue = window.localStorage.getItem(STORAGE_KEY)
      if (storedValue) {
        cachedFormattingPreferences = normalizeFormattingPreferences(JSON.parse(storedValue))
        return cachedFormattingPreferences
      }
    } catch {
      // Ignore corrupt persisted formatting and fall back to defaults.
    }
  }

  cachedFormattingPreferences = normalizeFormattingPreferences()
  return cachedFormattingPreferences
}

export function getCurrencySymbol(currencyCode) {
  const normalizedCurrencyCode = normalizeCurrencyCode(currencyCode)
  return supportedCurrencies.find(currency => currency.code === normalizedCurrencyCode)?.symbol || DEFAULT_CURRENCY_CODE
}

export function applyFormattingPreferences(preferences = {}) {
  cachedFormattingPreferences = normalizeFormattingPreferences(preferences)

  if (canUseLocalStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedFormattingPreferences))
    window.dispatchEvent(new CustomEvent('formatting-preferences-changed', {
      detail: cachedFormattingPreferences,
    }))
  }

  return cachedFormattingPreferences
}

export function syncFormattingPreferencesFromTemplate(template = {}) {
  return applyFormattingPreferences(template?.formatting || {})
}