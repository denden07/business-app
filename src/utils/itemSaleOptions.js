const BUILT_IN_OPTION_TYPES = {
  regular: {
    key: 'regular',
    type: 'regular',
    label: 'Regular',
    unit_quantity: 1,
    priceField: 'price1',
    isBuiltIn: true,
  },
  discount: {
    key: 'discount',
    type: 'discount',
    label: 'Discount',
    unit_quantity: 1,
    priceField: 'price2',
    isBuiltIn: true,
  },
}

export function normalizeSaleOptionRecord(option = {}) {
  const normalizedUnitQuantity = Math.max(1, Math.floor(Number(option.unit_quantity || 1) || 1))
  const normalizedPrice = Number(option.price || 0)
  const normalizedType = String(option.option_type || option.type || 'bundle').trim().toLowerCase() || 'bundle'
  const normalizedLabel = String(option.label || '').trim() || (normalizedType === 'wholesale' ? 'Wholesale' : 'Bundle')

  return {
    ...option,
    option_type: normalizedType,
    type: normalizedType,
    label: normalizedLabel,
    price: normalizedPrice,
    unit_quantity: normalizedUnitQuantity,
    is_active: option.is_active !== false,
  }
}

export function getBuiltInSaleOptions(item = {}) {
  const regular = {
    ...BUILT_IN_OPTION_TYPES.regular,
    price: Number(item.price1 || 0),
  }
  const discountPrice = Number(item.price2 || 0)
  const options = [regular]

  if (discountPrice > 0) {
    options.push({
      ...BUILT_IN_OPTION_TYPES.discount,
      price: discountPrice,
    })
  }

  return options
}

export function getCustomSaleOptionKey(option = {}) {
  return `option:${option.id}`
}

export function getCustomSaleOptions(options = []) {
  return options
    .map(normalizeSaleOptionRecord)
    .filter(option => option.is_active !== false && Number(option.price || 0) > 0)
    .map(option => ({
      ...option,
      key: getCustomSaleOptionKey(option),
      isBuiltIn: false,
    }))
}

export function getAvailableSaleOptions(item = {}, options = []) {
  return [
    ...getBuiltInSaleOptions(item),
    ...getCustomSaleOptions(options),
  ]
}

export function findSaleOption(item = {}, options = [], key = 'regular') {
  const available = getAvailableSaleOptions(item, options)
  return available.find(option => option.key === key) || available[0] || null
}

export function getSaleOptionUnitQuantity(option = {}) {
  return Math.max(1, Math.floor(Number(option.unit_quantity || 1) || 1))
}

export function formatSaleOptionQuantity(option = {}) {
  const unitQuantity = getSaleOptionUnitQuantity(option)
  return unitQuantity === 1 ? '1 pc' : `${unitQuantity} pcs`
}