import { shouldShowCustomerDirectoryByDefault } from '../utils/templatePresentation'

export const pageDefinitions = [
  { name: 'Home', label: 'Home', path: '/', icon: '🏠', configurable: true },
  { name: 'Items', label: 'Items', path: '/items', icon: '📦', configurable: true },
  { name: 'Sales', label: 'Sales', path: '/sales', icon: '💰', configurable: true },
  { name: 'Budget', label: 'Budget', path: '/budget', icon: '🧾', configurable: true },
  { name: 'Drafts', label: 'Drafts', path: '/drafts', icon: '📝', configurable: true },
  { name: 'Customers', label: 'Customers', path: '/customers', icon: '🧑‍🤝‍🧑', configurable: true },
  { name: 'Analytics', label: 'Analytics', path: '/analytics', icon: '📊', configurable: true },
  { name: 'Settings', label: 'Settings', path: '/settings', icon: '⚙️', configurable: false },
]

export const configurablePageDefinitions = pageDefinitions.filter(
  page => page.configurable !== false
)

export const configurablePageNames = new Set(
  configurablePageDefinitions.map(page => page.name)
)

const pinProtectionRouteAliases = {
  ItemDetails: 'Items',
  TransactionHistory: 'Customers',
}

export function getPinProtectionPageNameForRouteName(routeName) {
  if (!routeName) {
    return null
  }

  return pinProtectionRouteAliases[routeName] || routeName
}

export const templatePageSettingByRouteName = {
  Home: 'showHome',
  Items: 'showItems',
  Sales: 'showSales',
  Budget: 'showBudget',
  Drafts: 'showDrafts',
  Customers: 'showCustomers',
  Analytics: 'showAnalytics',
  Settings: 'showSettings',
}

export function createPageVisibilityMapFromTemplate(template) {
  const map = {}

  for (const page of configurablePageDefinitions) {
    const configKey = templatePageSettingByRouteName[page.name]
    const isEnabled = template?.pages?.[configKey] !== false

    if (page.name === 'Customers') {
      map[page.name] = isEnabled && shouldShowCustomerDirectoryByDefault(template)
      continue
    }

    map[page.name] = isEnabled
  }

  return map
}