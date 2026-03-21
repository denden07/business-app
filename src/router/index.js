import { createRouter, createWebHistory } from 'vue-router'
import { dbPromise } from '../db'

// Import pages (views)
import Home from '../views/Home.vue'
import Medicines from '../views/Medicines.vue'
import MedicineDetails from '../views/MedicineDetails.vue'
import Inventory from '../views/Inventory.vue'
import Sales from '../views/Sales.vue'
import Customers from '../views/Customers.vue'
import Analytics from '../views/Analytics.vue'
import TransactionHistory from '../views/TransactionHistory.vue'
import Settings from '../views/Settings.vue'
import Drafts from '../views/Drafts.vue'

let allRoutes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/medicines', name: 'Medicines', component: Medicines },
  { path: '/medicines/:id', name: 'MedicineDetails', component: MedicineDetails },
  { path: '/inventory', name: 'Inventory', component: Inventory },
  { path: '/sales', name: 'Sales', component: Sales },
  { path: '/customers', name: 'Customers', component: Customers },
  { path: '/analytics', name: 'Analytics', component: Analytics },
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
