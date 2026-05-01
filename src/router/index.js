import { createRouter, createWebHistory } from 'vue-router'
import { dbPromise } from '../db'
import { configurablePageNames } from '../templates/pages'
import { loadEffectivePageVisibility } from '../utils/templatePreferences'

// Import pages (views)
import Home from '../views/Home.vue'
import Items from '../views/Items.vue'
import ItemDetails from '../views/ItemDetails.vue'
import Sales from '../views/Sales.vue'
import Budget from '../views/Budget.vue'
import Customers from '../views/Customers.vue'
import Analytics from '../views/Analytics.vue'
import About from '../views/About.vue'
import TransactionHistory from '../views/TransactionHistory.vue'
import Settings from '../views/Settings.vue'
import Drafts from '../views/Drafts.vue'
import Setup from '../views/Setup.vue'
import Login from '../views/Login.vue'
import { isOnboardingComplete } from '../utils/onboardingPreferences'
import store from '../store'
import {
  consumePendingAuthLoginRedirectContext,
  isPagePinProtected,
  promptForSettingsPin,
} from '../utils/auth'

let allRoutes = [
  { path: '/setup', name: 'Setup', component: Setup, meta: { hideSidebar: true, allowWithoutSetup: true } },
  { path: '/login', name: 'Login', component: Login, meta: { hideSidebar: true, allowWithoutAuth: true } },
  { path: '/', name: 'Home', component: Home },
  { path: '/items', name: 'Items', component: Items },
  { path: '/items/:id', name: 'ItemDetails', component: ItemDetails },
  { path: '/medicines', redirect: '/items' },
  { path: '/medicines/:id', redirect: to => ({ path: `/items/${to.params.id}`, query: to.query }) },
  { path: '/sales', name: 'Sales', component: Sales },
  { path: '/budget', name: 'Budget', component: Budget },
  { path: '/customers', name: 'Customers', component: Customers },
  { path: '/analytics', name: 'Analytics', component: Analytics },
  { path: '/about', name: 'About', component: About },
  { path: '/settings', name: 'Settings', component: Settings },
  { path: '/drafts', name: 'Drafts', component: Drafts },
  {
    path: '/customers/:id/transactions',
    name: 'TransactionHistory',
    component: TransactionHistory,
    props: route => ({ 
      customerId: route.params.id,
      tab: route.query.tab || 'points' // default tab
    }),
  }
]

async function buildRoutes() {
  try {
    await dbPromise
    const { map: visibleMap } = await loadEffectivePageVisibility()
    return allRoutes.filter(route => {
      if (!route.name || !configurablePageNames.has(route.name)) {
        return true
      }

      return visibleMap[route.name] !== false
    })
  } catch (err) {
    console.error('Failed to load pages visibility', err)
    return allRoutes
  }
}

const routes = await buildRoutes()

const router = createRouter({
  history: createWebHistory(),
  routes
})

async function verifyRoutePin(pageName) {
  return promptForSettingsPin({
    title: '🔒 Access Restricted',
    text: `Enter your PIN to access ${pageName}`,
    confirmButtonText: 'Unlock',
    cancelButtonText: 'Go Back',
  })
}

router.beforeEach(async (to, from) => {
  const onboardingComplete = await isOnboardingComplete()

  if (!onboardingComplete && to.name !== 'Setup') {
    return {
      name: 'Setup',
      query: { redirect: to.fullPath },
    }
  }

  await store.dispatch('auth/initialize')

  const authEnabled = store.getters['auth/isEnabled']
  const authenticated = store.getters['auth/isAuthenticated']

  if (to.name === 'Login') {
    if (!authEnabled) {
      return typeof to.query.redirect === 'string' && to.query.redirect ? to.query.redirect : '/'
    }

    if (authenticated) {
      return typeof to.query.redirect === 'string' && to.query.redirect ? to.query.redirect : '/'
    }

    return true
  }

  if (authEnabled && !authenticated && !to.meta?.allowWithoutAuth && to.name !== 'Setup') {
    const redirectContext = consumePendingAuthLoginRedirectContext()

    return {
      name: 'Login',
      query: {
        redirect: redirectContext?.redirect || to.fullPath,
        reason: redirectContext?.reason || 'expired',
      },
    }
  }

  const requiresPin = await isPagePinProtected(to.name)

  if (!requiresPin) return true

  const isAuthorized = await verifyRoutePin(to.name || 'this page')
  if (isAuthorized) return true

  return from.matched.length ? from.fullPath : '/'
})

// helper to refresh routes after updating settings
async function refreshRoutes() {
  const newRoutes = await buildRoutes()
  // clear existing and add new
  router.getRoutes().forEach(rt => {
    try { router.removeRoute(rt.name) } catch (e) {}
  })
  newRoutes.forEach(r => router.addRoute(r))
}

export { refreshRoutes }
export default router
