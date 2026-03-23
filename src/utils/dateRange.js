function parseLocalDate(dateInput) {
  if (!dateInput) return null

  if (dateInput instanceof Date) {
    const time = dateInput.getTime()
    if (Number.isNaN(time)) return null

    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate())
  }

  const [year, month, day] = String(dateInput).split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

function getNextLocalDay(dateInput) {
  const date = parseLocalDate(dateInput)
  if (!date) return null

  date.setDate(date.getDate() + 1)
  return date
}

export function getLocalDayStart(dateInput) {
  return parseLocalDate(dateInput)
}

export function getLocalDayEndExclusive(dateInput) {
  return getNextLocalDay(dateInput)
}

export function getLocalDayEnd(dateInput) {
  const endExclusive = getLocalDayEndExclusive(dateInput)
  if (!endExclusive) return null

  return new Date(endExclusive.getTime() - 1)
}

export function buildDateKeyRange(startDate, endDate) {
  const start = getLocalDayStart(startDate)
  const endExclusive = getLocalDayEndExclusive(endDate)

  if (start && endExclusive) {
    return IDBKeyRange.bound(start.toISOString(), endExclusive.toISOString(), false, true)
  }

  if (start) {
    return IDBKeyRange.lowerBound(start.toISOString())
  }

  if (endExclusive) {
    return IDBKeyRange.upperBound(endExclusive.toISOString(), true)
  }

  return null
}

export function buildCustomerDateKeyRange(customerId, startDate, endDate) {
  const start = getLocalDayStart(startDate)
  const endExclusive = getLocalDayEndExclusive(endDate)

  if (start && endExclusive) {
    return IDBKeyRange.bound(
      [customerId, start.toISOString()],
      [customerId, endExclusive.toISOString()],
      false,
      true
    )
  }

  if (start) {
    return IDBKeyRange.lowerBound([customerId, start.toISOString()])
  }

  if (endExclusive) {
    return IDBKeyRange.upperBound([customerId, endExclusive.toISOString()], true)
  }

  return IDBKeyRange.bound([customerId, ''], [customerId, '\uffff'])
}

export function isWithinLocalDateRange(value, startDate, endDate) {
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()

  if (Number.isNaN(time)) return false

  const start = getLocalDayStart(startDate)
  if (start && time < start.getTime()) {
    return false
  }

  const endExclusive = getLocalDayEndExclusive(endDate)
  if (endExclusive && time >= endExclusive.getTime()) {
    return false
  }

  return true
}