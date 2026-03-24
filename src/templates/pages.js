export const pageDefinitions = [
  { name: 'Home', label: 'Home', path: '/', icon: '🏠', configurable: true },
  { name: 'Items', label: 'Items', path: '/items', icon: '📦', configurable: true },
  { name: 'Sales', label: 'Sales', path: '/sales', icon: '💰', configurable: true },
  { name: 'Drafts', label: 'Drafts', path: '/drafts', icon: '📝', configurable: true },
  { name: 'Customers', label: 'Customers', path: '/customers', icon: '🧑‍🤝‍🧑', configurable: true },
  { name: 'Analytics', label: 'Analytics', path: '/analytics', icon: '📊', configurable: true },
  { name: 'About', label: 'About', path: '/about', icon: 'ℹ️', configurable: true },
  { name: 'Settings', label: 'Settings', path: '/settings', icon: '⚙️', configurable: false },
]

export const configurablePageDefinitions = pageDefinitions.filter(
  page => page.configurable !== false
)

export const configurablePageNames = new Set(
  configurablePageDefinitions.map(page => page.name)
)

export const templatePageSettingByRouteName = {
  Home: 'showHome',
  Items: 'showItems',
  Sales: 'showSales',
  Drafts: 'showDrafts',
  Customers: 'showCustomers',
  Analytics: 'showAnalytics',
  About: 'showAbout',
  Settings: 'showSettings',
}

export function createPageVisibilityMapFromTemplate(template) {
  const map = {}

  for (const page of configurablePageDefinitions) {
    const configKey = templatePageSettingByRouteName[page.name]
    map[page.name] = template?.pages?.[configKey] !== false
  }

  return map
}