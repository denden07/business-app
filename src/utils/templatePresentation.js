export function isLoyaltyEnabled(template = {}) {
  return template?.customer?.enableLoyalty !== false
}

export function isCustomerSelectionRequired(template = {}) {
  return template?.workflow?.requireCustomer === true || template?.customer?.requireCustomerDetails === true
}

export function shouldShowCustomerDirectoryByDefault(template = {}) {
  return template?.pages?.showCustomers !== false && (isLoyaltyEnabled(template) || isCustomerSelectionRequired(template))
}

export function normalizePaymentMethod(method) {
  return String(method || 'cash').toLowerCase() === 'gcash' ? 'gcash' : 'cash'
}

export function getTemplatePaymentLabel(method, labels = {}) {
  const normalizedMethod = normalizePaymentMethod(method)
  return normalizedMethod === 'gcash'
    ? (labels.paymentGcash || 'Online Bank')
    : (labels.paymentCash || 'Cash')
}

export function getTemplateProfessionalFeeLabel(labels = {}) {
  return labels.professionalFee || 'Additional Fee'
}

export function getTemplateCustomerSectionLabel(labels = {}) {
  return labels.customerSection || 'Sold to'
}