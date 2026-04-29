const DAY_MS = 24 * 60 * 60 * 1000

export const DEFAULT_EXPIRY_WARNING_DAYS = 30
export const DEFAULT_EXPIRY_CRITICAL_DAYS = 7

function toLocalStartOfDay(value) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function normalizeExpiryAlertSettings(source = {}) {
  const parsedWarningDays = Number(source?.expiryWarningDays)
  const parsedCriticalDays = Number(source?.expiryCriticalDays)
  const warningDays = Number.isFinite(parsedWarningDays) && parsedWarningDays > 0
    ? Math.round(parsedWarningDays)
    : DEFAULT_EXPIRY_WARNING_DAYS
  const criticalDays = Number.isFinite(parsedCriticalDays) && parsedCriticalDays > 0
    ? Math.round(parsedCriticalDays)
    : DEFAULT_EXPIRY_CRITICAL_DAYS

  return {
    warningDays,
    criticalDays: Math.min(warningDays, criticalDays),
  }
}

export function getDaysUntilExpiry(expiryDate, referenceDate = new Date()) {
  const normalizedExpiry = toLocalStartOfDay(expiryDate)
  const normalizedReference = toLocalStartOfDay(referenceDate)

  if (!normalizedExpiry || !normalizedReference) {
    return null
  }

  return Math.round((normalizedExpiry.getTime() - normalizedReference.getTime()) / DAY_MS)
}

export function classifyExpiryDate(expiryDate, settings = {}, referenceDate = new Date()) {
  const daysUntil = getDaysUntilExpiry(expiryDate, referenceDate)
  const normalizedSettings = normalizeExpiryAlertSettings(settings)

  if (daysUntil === null) {
    return { status: 'none', daysUntil: null }
  }

  if (daysUntil < 0) {
    return { status: 'expired', daysUntil }
  }

  if (daysUntil <= normalizedSettings.criticalDays) {
    return { status: 'critical', daysUntil }
  }

  if (daysUntil <= normalizedSettings.warningDays) {
    return { status: 'warning', daysUntil }
  }

  return { status: 'ok', daysUntil }
}

export function getSellableQuantityFromBatches(batches = [], options = {}) {
  const { trackExpiry = false, referenceDate = new Date() } = options

  return batches.reduce((sum, batch) => {
    const quantity = Number(batch?.quantity || 0)
    if (quantity <= 0) {
      return sum
    }

    if (!trackExpiry) {
      return sum + quantity
    }

    const { status } = classifyExpiryDate(batch?.expiry_date, options, referenceDate)
    return status === 'expired' ? sum : sum + quantity
  }, 0)
}

export function summarizeExpiryForBatches(batches = [], options = {}) {
  const { trackExpiry = false, referenceDate = new Date() } = options
  const settings = normalizeExpiryAlertSettings(options)
  const summary = {
    tracked: trackExpiry,
    status: trackExpiry ? 'ok' : 'not-tracked',
    label: trackExpiry ? 'Fresh' : 'Not tracked',
    earliestExpiryDate: null,
    earliestDaysUntil: null,
    trackedBatchCount: 0,
    affectedBatchCount: 0,
    totalTrackedQuantity: 0,
    expiredQuantity: 0,
    criticalQuantity: 0,
    warningQuantity: 0,
    sellableQuantity: 0,
  }

  summary.sellableQuantity = batches.reduce((sum, batch) => sum + Number(batch?.quantity || 0), 0)

  if (!trackExpiry) {
    return summary
  }

  for (const batch of batches) {
    const quantity = Number(batch?.quantity || 0)
    if (quantity <= 0 || !batch?.expiry_date || batch?.expired_removed) {
      continue
    }

    const { status, daysUntil } = classifyExpiryDate(batch.expiry_date, settings, referenceDate)
    summary.trackedBatchCount += 1
    summary.totalTrackedQuantity += quantity

    if (summary.earliestDaysUntil === null || (daysUntil !== null && daysUntil < summary.earliestDaysUntil)) {
      summary.earliestDaysUntil = daysUntil
      summary.earliestExpiryDate = batch.expiry_date
    }

    if (status === 'expired') {
      summary.expiredQuantity += quantity
      summary.affectedBatchCount += 1
      continue
    }

    if (status === 'critical') {
      summary.criticalQuantity += quantity
      summary.affectedBatchCount += 1
      continue
    }

    if (status === 'warning') {
      summary.warningQuantity += quantity
      summary.affectedBatchCount += 1
    }
  }

  if (summary.expiredQuantity > 0) {
    summary.status = 'expired'
    if (summary.earliestDaysUntil !== null && summary.earliestDaysUntil < 0) {
      const daysAgo = Math.abs(summary.earliestDaysUntil)
      summary.label = daysAgo === 1 ? 'Expired 1 day ago' : `Expired ${daysAgo} days ago`
    } else {
      summary.label = 'Expired stock'
    }
  } else if (summary.criticalQuantity > 0) {
    summary.status = 'critical'
    summary.label = formatUpcomingExpiryLabel(summary.earliestDaysUntil, 'Critical expiry')
  } else if (summary.warningQuantity > 0) {
    summary.status = 'warning'
    summary.label = formatUpcomingExpiryLabel(summary.earliestDaysUntil, 'Near expiry')
  } else if (summary.trackedBatchCount === 0) {
    summary.status = 'none'
    summary.label = 'No expiry dates yet'
  }

  return summary
}

export function sortBatchesForSale(batches = [], options = {}) {
  const { trackExpiry = false, referenceDate = new Date() } = options

  return [...batches].sort((left, right) => {
    const leftQty = Number(left?.quantity || 0)
    const rightQty = Number(right?.quantity || 0)
    const leftStatus = trackExpiry ? classifyExpiryDate(left?.expiry_date, options, referenceDate).status : 'ok'
    const rightStatus = trackExpiry ? classifyExpiryDate(right?.expiry_date, options, referenceDate).status : 'ok'
    const leftRank = expiryStatusRank(leftStatus)
    const rightRank = expiryStatusRank(rightStatus)

    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    const leftExpiry = getDaysUntilExpiry(left?.expiry_date, referenceDate)
    const rightExpiry = getDaysUntilExpiry(right?.expiry_date, referenceDate)
    const normalizedLeftExpiry = leftExpiry === null ? Number.MAX_SAFE_INTEGER : leftExpiry
    const normalizedRightExpiry = rightExpiry === null ? Number.MAX_SAFE_INTEGER : rightExpiry

    if (normalizedLeftExpiry !== normalizedRightExpiry) {
      return normalizedLeftExpiry - normalizedRightExpiry
    }

    if (leftQty !== rightQty) {
      return rightQty - leftQty
    }

    return Number(left?.id || 0) - Number(right?.id || 0)
  })
}

function expiryStatusRank(status) {
  switch (status) {
    case 'critical':
      return 0
    case 'warning':
      return 1
    case 'ok':
    case 'none':
      return 2
    case 'expired':
      return 3
    default:
      return 4
  }
}

function formatUpcomingExpiryLabel(daysUntil, fallbackLabel) {
  if (daysUntil === null) {
    return fallbackLabel
  }

  if (daysUntil <= 0) {
    return daysUntil === 0 ? 'Expires today' : fallbackLabel
  }

  if (daysUntil === 1) {
    return 'Expires in 1 day'
  }

  return `Expires in ${daysUntil} days`
}