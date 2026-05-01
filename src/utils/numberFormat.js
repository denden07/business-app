import { getCurrencySymbol, getFormattingPreferences } from './formattingPreferences'

export function formatNumber(value, options = {}) {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits,
  } = options
  const formattingPreferences = getFormattingPreferences()
  const resolvedMaximumFractionDigits = maximumFractionDigits ?? formattingPreferences.decimalPlaces

  const numericValue = Number(value ?? 0)

  if (!Number.isFinite(numericValue)) {
    return Number(0).toLocaleString(undefined, {
      minimumFractionDigits,
      maximumFractionDigits: resolvedMaximumFractionDigits,
    })
  }

  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits: resolvedMaximumFractionDigits,
  })
}

export function formatCurrency(value, options = {}) {
  const formattingPreferences = getFormattingPreferences()
  const {
    includeSymbol = true,
    currencyCode = formattingPreferences.currencyCode,
    minimumFractionDigits = formattingPreferences.decimalPlaces,
    maximumFractionDigits = formattingPreferences.decimalPlaces,
  } = options
  const formatted = formatNumber(value, {
    minimumFractionDigits,
    maximumFractionDigits,
  })

  if (!includeSymbol) {
    return formatted
  }

  return `${getCurrencySymbol(currencyCode)}${formatted}`
}