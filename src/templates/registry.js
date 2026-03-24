import { createPageVisibilityMapFromTemplate } from './pages'

export const DEFAULT_TEMPLATE_ID = 'generic'

const baseTemplate = {
  id: DEFAULT_TEMPLATE_ID,
  label: 'Generic',
  description: 'Balanced defaults for businesses that need a customizable starting point.',
  capabilities: {
    products: true,
    services: true,
    stockTracking: 'optional',
    batchTracking: 'optional',
    expiryTracking: 'optional',
    loyalty: 'optional',
    variants: 'optional',
    notes: 'optional',
    mixedTransaction: true,
    specializedReporting: false,
  },
  workflow: {
    allowProductSales: true,
    allowServiceSales: true,
    allowMixedItems: true,
    requireBatchSelection: false,
    requireCustomer: false,
    requireNotes: false,
  },
  itemDefaults: {
    itemType: 'product',
    trackStock: false,
    trackBatches: false,
    trackExpiry: false,
  },
  customer: {
    enableLoyalty: true,
    requireCustomerDetails: false,
  },
  pages: {
    showHome: true,
    showItems: true,
    showSales: true,
    showDrafts: true,
    showCustomers: true,
    showAnalytics: true,
    showAbout: true,
    showSettings: true,
  },
  reporting: {
    focus: 'mixed',
  },
  labels: {
    catalog: 'Items',
    catalogEntry: 'Item',
  },
}

function mergeDeep(baseValue, overrideValue) {
  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return overrideValue ?? baseValue
  }

  if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
    return overrideValue ?? baseValue
  }

  const merged = { ...baseValue }

  for (const [key, value] of Object.entries(overrideValue)) {
    merged[key] = key in baseValue ? mergeDeep(baseValue[key], value) : value
  }

  return merged
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function defineTemplate(template) {
  const merged = mergeDeep(baseTemplate, template)
  merged.defaultPageVisibility = createPageVisibilityMapFromTemplate(merged)
  return Object.freeze(merged)
}

const templates = [
  defineTemplate(baseTemplate),
  defineTemplate({
    id: 'sari-sari-store',
    label: 'Sari-sari Store',
    description: 'Retail-focused defaults for a neighborhood store.',
    capabilities: {
      services: false,
      stockTracking: 'required',
      batchTracking: false,
      reporting: 'sales',
    },
    workflow: {
      allowServiceSales: false,
      allowMixedItems: false,
    },
    itemDefaults: {
      itemType: 'product',
      trackStock: true,
      trackBatches: false,
      trackExpiry: false,
    },
    reporting: {
      focus: 'sales',
    },
  }),
  defineTemplate({
    id: 'pharmacy',
    label: 'Pharmacy',
    description: 'Inventory-heavy defaults with batch and expiry tracking enabled.',
    capabilities: {
      stockTracking: 'required',
      batchTracking: 'required',
      expiryTracking: 'required',
      variants: false,
      notes: 'required',
      specializedReporting: true,
    },
    workflow: {
      allowMixedItems: false,
      requireBatchSelection: true,
      requireNotes: true,
    },
    itemDefaults: {
      itemType: 'product',
      trackStock: true,
      trackBatches: true,
      trackExpiry: true,
    },
    reporting: {
      focus: 'inventory',
    },
  }),
  defineTemplate({
    id: 'food-cart',
    label: 'Food Cart',
    description: 'Mixed product and service defaults for quick-serve operations.',
    capabilities: {
      notes: 'required',
    },
    workflow: {
      requireNotes: true,
    },
    itemDefaults: {
      itemType: 'product',
      trackStock: true,
      trackBatches: false,
      trackExpiry: false,
    },
    reporting: {
      focus: 'mixed',
    },
  }),
  defineTemplate({
    id: 'car-wash',
    label: 'Car Wash',
    description: 'Service-first defaults with lighter inventory assumptions.',
    capabilities: {
      products: 'optional',
      stockTracking: 'optional',
      batchTracking: false,
      expiryTracking: false,
      variants: false,
      notes: 'required',
    },
    itemDefaults: {
      itemType: 'service',
      trackStock: false,
      trackBatches: false,
      trackExpiry: false,
    },
    reporting: {
      focus: 'services',
    },
  }),
  defineTemplate({
    id: 'repair-shop',
    label: 'Repair Shop',
    description: 'Mixed product and service defaults for labor plus parts workflows.',
    capabilities: {
      stockTracking: 'required',
      batchTracking: false,
      expiryTracking: false,
      notes: 'required',
      mixedTransaction: true,
    },
    workflow: {
      allowMixedItems: true,
      requireNotes: true,
    },
    itemDefaults: {
      itemType: 'service',
      trackStock: false,
      trackBatches: false,
      trackExpiry: false,
    },
    reporting: {
      focus: 'mixed',
    },
  }),
]

export const templateRegistry = Object.freeze(templates)

export function listTemplates() {
  return templateRegistry
}

export function getTemplateDefinition(templateId) {
  return templateRegistry.find(template => template.id === templateId) || templateRegistry[0]
}

export function mergeTemplateConfig(baseValue, overrideValue) {
  return mergeDeep(baseValue, overrideValue)
}

export function getResolvedTemplateDefinition(templateId, overrides = {}) {
  const resolved = mergeDeep(getTemplateDefinition(templateId), overrides || {})
  resolved.defaultPageVisibility = createPageVisibilityMapFromTemplate(resolved)
  return resolved
}