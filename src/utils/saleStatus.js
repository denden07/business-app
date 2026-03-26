export function normalizeSalePaymentStatus(sale = {}) {
  const explicitStatus = String(sale.payment_status || '').toLowerCase()
  if (explicitStatus === 'paid' || explicitStatus === 'partial' || explicitStatus === 'unpaid') {
    return explicitStatus
  }

  const total = Math.max(Number(sale.final_total || 0), 0)
  if (total <= 0) {
    return 'paid'
  }

  const amountPaid = getSaleAmountPaid(sale)
  const outstandingBalance = Math.max(total - amountPaid, 0)

  if (outstandingBalance <= 0) {
    return 'paid'
  }

  return amountPaid > 0 ? 'partial' : 'unpaid'
}

export function getSaleAmountPaid(sale = {}) {
  const total = Math.max(Number(sale.final_total || 0), 0)
  const explicitAmountPaid = Number(sale.amount_paid)

  if (Number.isFinite(explicitAmountPaid)) {
    return Math.min(Math.max(explicitAmountPaid, 0), total)
  }

  const inferredAmountPaid = Number(sale.money_given || 0)
  return Math.min(Math.max(inferredAmountPaid, 0), total)
}

export function getSaleOutstandingBalance(sale = {}) {
  const explicitOutstandingBalance = Number(sale.outstanding_balance)
  if (Number.isFinite(explicitOutstandingBalance)) {
    return Math.max(explicitOutstandingBalance, 0)
  }

  const total = Math.max(Number(sale.final_total || 0), 0)
  return Math.max(total - getSaleAmountPaid(sale), 0)
}

export function isDebtSale(sale = {}) {
  return sale.status !== 'voided' && normalizeSalePaymentStatus(sale) !== 'paid'
}

export function canSettleDebtSale(sale = {}) {
  return sale.status !== 'voided' && getSaleOutstandingBalance(sale) > 0
}

export function getSaleDisplayStatus(sale = {}) {
  if (sale.status === 'voided') {
    return 'voided'
  }

  return isDebtSale(sale) ? 'debt' : 'completed'
}

export function getSalePaymentStatusLabel(sale = {}) {
  const paymentStatus = normalizeSalePaymentStatus(sale)
  if (paymentStatus === 'partial') {
    return 'partial'
  }

  if (paymentStatus === 'unpaid') {
    return 'unpaid'
  }

  return 'paid'
}