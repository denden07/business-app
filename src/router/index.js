import { createRouter, createWebHistory } from 'vue-router'
import { dbPromise } from '../db'
import Swal from 'sweetalert2'

// Import pages (views)
import Home from '../views/Home.vue'
import Items from '../views/Items.vue'
import ItemDetails from '../views/ItemDetails.vue'
import Inventory from '../views/Inventory.vue'
import Sales from '../views/Sales.vue'
import Customers from '../views/Customers.vue'
import Analytics from '../views/Analytics.vue'
import About from '../views/About.vue'
import TransactionHistory from '../views/TransactionHistory.vue'
import Settings from '../views/Settings.vue'
import Drafts from '../views/Drafts.vue'

let allRoutes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/items', name: 'Items', component: Items },
  { path: '/items/:id', name: 'ItemDetails', component: ItemDetails },
  { path: '/medicines', redirect: '/items' },
  { path: '/medicines/:id', redirect: to => ({ path: `/items/${to.params.id}`, query: to.query }) },
  { path: '/inventory', name: 'Inventory', component: Inventory },
  { path: '/sales', name: 'Sales', component: Sales },
  { path: '/customers', name: 'Customers', component: Customers },
  { path: '/analytics', name: 'Analytics', component: Analytics, meta: { requiresPin: true } },
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
    const db = await dbPromise
    const visibleMap = {}
    let hasRows = false
    let cursor = await db.transaction('pages').objectStore('pages').openCursor()
    while (cursor) {
      hasRows = true
      const page = cursor.value
      visibleMap[page.name] = !!page.visible
      cursor = await cursor.continue()
    }
    if (!hasRows) return allRoutes
    return allRoutes.filter(r => !r.name || visibleMap[r.name] !== false)
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

async function getSettingsPin() {
  try {
    const db = await dbPromise
    const row = await db.get('app_settings', 'settings-pin')
    return row ? row.value : null
  } catch {
    return null
  }
}

async function verifyRoutePin(pageName) {
  const storedPin = await getSettingsPin()
  if (!storedPin) return true

  const result = await Swal.fire({
    title: '🔒 Access Restricted',
    text: `Enter your PIN to access ${pageName}`,
    input: 'password',
    inputPlaceholder: 'Enter PIN',
    inputAttributes: { maxlength: 8, autocomplete: 'off' },
    showCancelButton: true,
    confirmButtonText: 'Unlock',
    cancelButtonText: 'Go Back',
    confirmButtonColor: '#1abc9c',
    cancelButtonColor: '#888',
    allowOutsideClick: false,
    allowEscapeKey: false,
  })

  if (!result.isConfirmed) return false
  if (result.value === storedPin) return true

  await Swal.fire({
    icon: 'error',
    title: 'Incorrect PIN',
    timer: 1400,
    showConfirmButton: false,
  })
  return false
}

router.beforeEach(async (to, from) => {
  if (!to.meta?.requiresPin) return true

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
