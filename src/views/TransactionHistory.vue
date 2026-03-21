<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SearchInput from '../components/SearchInput.vue'
import Pagination from '../components/Pagination.vue'
import { useStore } from 'vuex'
import { dbPromise } from '../db'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { format } from 'date-fns'

const route = useRoute()
const store = useStore()

const router = useRouter()

const customerId = Number(route.params.id)

/* ======================
   STATE
====================== */
const activeTab = ref('points')
const startDate = ref('')
const endDate = ref('')
const dateRange = ref(null)
const isDark = ref(localStorage.getItem('darkMode') === 'true')
const filterType = ref('all')
const sortOrder = ref('desc')
const currentPage = ref(1)
const itemsPerPage = ref(10)
const itemsPerPageOptions = [5, 10, 20, 50]
/* ======================
   COLUMN VISIBILITY
====================== */
const _txDefaultCols = { pt_date: true, pt_points: true, pt_type: true, pt_description: true, pt_sale: true, pu_date: true, pu_id: true, pu_total: true, pu_status: true }
const colMenuOpen = ref(false)
const visibleCols = ref({ ..._txDefaultCols, ...JSON.parse(localStorage.getItem('col-vis-transaction') || '{}') })
watch(visibleCols, v => localStorage.setItem('col-vis-transaction', JSON.stringify(v)), { deep: true })
const ptCols = [
  { key: 'pt_date', label: 'Date' },
  { key: 'pt_points', label: 'Points' },
  { key: 'pt_type', label: 'Type' },
  { key: 'pt_description', label: 'Notes' },
  { key: 'pt_sale', label: 'Sale #' },
]
const puCols = [
  { key: 'pu_date', label: 'Date' },
  { key: 'pu_id', label: 'Sale #' },
  { key: 'pu_total', label: 'Total' },
  { key: 'pu_status', label: 'Status' },
]
const activeCols = computed(() => activeTab.value === 'points' ? ptCols : puCols)
const toggleCol = (key) => { visibleCols.value[key] = !visibleCols.value[key] }
const showSaleModal = ref(false)
const selectedSale = ref(null)
const saleCustomer = ref(null)
const currentCustomer = ref(null)

/* ======================
   WATCHERS
====================== */
watch(dateRange, (range) => {
  if (range && range[0] && range[1]) {
    startDate.value = format(range[0], 'yyyy-MM-dd')
    endDate.value = format(range[1], 'yyyy-MM-dd')
  } else {
    startDate.value = ''
    endDate.value = ''
  }
})

watch([activeTab, startDate, endDate, sortOrder], () => {
  currentPage.value = 1
})

/* ======================
   LOAD DATA
====================== */
onMounted(async () => {
  currentCustomer.value = await dbPromise.then(db => db.get('customers', customerId))
  await store.dispatch('transaction/loadPointsHistory', customerId)
  await store.dispatch('transaction/loadSales', customerId)
})

/* ======================
   VUEX SOURCES
====================== */
const pointsHistory = computed(() =>
  store.state.transaction.pointsHistory
)

const sales = computed(() =>
  store.state.transaction.sales
)

/* ======================
   FILTERED DATA
====================== */
const filteredPoints = computed(() => {
  return pointsHistory.value
    .filter(p => {
      const pd = new Date(p.date)
      if (startDate.value) {
        const sd = new Date(startDate.value)
        if (pd < sd) return false
      }
      if (endDate.value) {
        const ed = new Date(endDate.value + 'T23:59:59')
        if (pd > ed) return false
      }
      if (filterType.value && filterType.value !== 'all') {
        if (p.type !== filterType.value) return false
      }
      return true
    })
    .sort((a, b) =>
      sortOrder.value === 'asc'
        ? new Date(a.date) - new Date(b.date)
        : new Date(b.date) - new Date(a.date)
    )
})

const filteredSales = computed(() => {
  return sales.value
    .filter(s => {
      const sd = new Date(s.created_at)
      if (startDate.value) {
        const from = new Date(startDate.value)
        if (sd < from) return false
      }
      if (endDate.value) {
        const to = new Date(endDate.value + 'T23:59:59')
        if (sd > to) return false
      }
      return true
    })
    .sort((a, b) =>
      sortOrder.value === 'asc'
        ? new Date(a.created_at) - new Date(b.created_at)
        : new Date(b.created_at) - new Date(a.created_at)
    )
})

/* ======================
   PAGINATION
====================== */
const activeList = computed(() =>
  activeTab.value === 'points' ? filteredPoints.value : filteredSales.value
)

const totalPages = computed(() =>
  Math.ceil(activeList.value.length / itemsPerPage.value)
)

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return activeList.value.slice(start, start + itemsPerPage.value)
})

const goPage = (page) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

const pageNumbers = computed(() =>
  Array.from({ length: totalPages.value }, (_, i) => i + 1)
)

function goBack() {
  const q = route.query || {}
  const payload = {}
  if (q.page) payload.page = q.page
  if (q.search !== undefined) payload.search = q.search
  if (q.perPage) payload.perPage = q.perPage
  if (q.sortBy) payload.sortBy = q.sortBy
  if (q.sortOrder) payload.sortOrder = q.sortOrder

  router.push({ name: 'Customers', query: payload })
}

/* ======================
   MODAL
====================== */
const selectedSaleItems = ref([]) // for medicines in modal

const openSaleModal = async (sale) => {
  if (!sale) return

  const db = await dbPromise

  // single transaction for items and medicines
  const tx = db.transaction(['sale_items', 'medicines'], 'readonly')
  const itemsStore = tx.objectStore('sale_items')
  const medsStore = tx.objectStore('medicines')

  const items = await itemsStore.index('sale_id').getAll(sale.id)

  for (const item of items) {
    const med = await medsStore.get(item.medicine_id)
    item.medicine_name = med?.name || 'Unknown'
    item.generic_name = med?.generic_name || ''
  }

  if (sale.customer_id) {
    saleCustomer.value = await db.get('customers', sale.customer_id)
  } else {
    saleCustomer.value = null
  }

  await tx.done

  selectedSale.value = sale
  selectedSaleItems.value = items
  showSaleModal.value = true
}




const closeSaleModal = () => {
  showSaleModal.value = false
  selectedSale.value = null
  selectedSaleItems.value = []
  saleCustomer.value = null
}

const saleStatusLabel = computed(() => {
  if (!selectedSale.value) return ''
  return selectedSale.value.status === 'voided' ? 'VOIDED' : 'COMPLETED'
})

const salePurchasedAt = computed(() => {
  if (!selectedSale.value) return ''
  return selectedSale.value.purchased_date || selectedSale.value.created_at || ''
})

const saleDiscountAmount = computed(() => {
  if (!selectedSale.value) return 0
  return Number(selectedSale.value.discount ?? selectedSale.value.points_discount ?? 0)
})

const currentCustomerPoints = computed(() => {
  if (currentCustomer.value?.points !== undefined && currentCustomer.value?.points !== null) {
    return Number(currentCustomer.value.points || 0)
  }
  return pointsHistory.value.reduce((sum, entry) => sum + Number(entry.points || 0), 0)
})

const currentCustomerName = computed(() => currentCustomer.value?.name || `Customer #${customerId}`)
</script>

<template>
  <div class="medicines-page">
    <div class="page-header">
      <div>
        <h1>Customer Transactions</h1>
        <p class="page-subtitle">Transaction activity and points history for the selected customer.</p>
      </div>

      <button class="info back-btn" @click="goBack">← Back to Customers</button>
    </div>

    <div class="customer-summary">
      <div class="customer-summary-card">
        <span class="summary-label">Current Customer</span>
        <strong class="summary-value">{{ currentCustomerName }}</strong>
      </div>
      <div class="customer-summary-card points-card">
        <span class="summary-label">Available Points</span>
        <strong class="summary-value">{{ currentCustomerPoints }}</strong>
      </div>
    </div>

    <!-- TABS -->
    <div class="tabs">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'points' }"
        @click="activeTab = 'points'"
      >
        Points History
      </button>

      <button
        class="tab-button"
        :class="{ active: activeTab === 'purchases' }"
        @click="activeTab = 'purchases'"
      >
        Purchase History
      </button>
    </div>

    <!-- TOP BAR -->
    <div class="top-bar">
      <VueDatePicker
        v-model="dateRange"
        range
        :enable-time-picker="false"
        :dark="isDark"
        auto-apply
        teleport
      >
        <template #trigger>
          <button type="button" class="date-icon-btn" :class="{ active: dateRange }" :title="dateRange ? 'Date filter active' : 'Filter by date range'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" />
              <path d="M3 10h18" stroke="currentColor" stroke-width="1.5" />
              <path d="M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <span v-if="dateRange" class="date-clear" @click.stop="dateRange = null" title="Clear date filter">×</span>
          </button>
        </template>
      </VueDatePicker>

      <select v-if="activeTab === 'points'" v-model="filterType" class="select-field">
        <option value="all">All Types</option>
        <option value="sale">Sale</option>
        <option value="manual">Manual</option>
      </select>

      <select v-model="sortOrder" class="select-field">
        <option value="desc">Newest</option>
        <option value="asc">Oldest</option>
      </select>
      <select v-model.number="itemsPerPage" class="select-field">
        <option v-for="o in itemsPerPageOptions" :key="o" :value="o">
          {{ o }}
        </option>
      </select>
      <button class="secondary" @click="dateRange = null; filterType='all'">Clear</button>
    </div>

    <!-- POINTS HISTORY -->
    <div v-if="activeTab === 'points'" class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
    <table>
      <thead>
        <tr>
          <th v-if="visibleCols.pt_date">Date</th>
          <th v-if="visibleCols.pt_points">Points</th>
          <th v-if="visibleCols.pt_type">Type</th>
          <th v-if="visibleCols.pt_description">Notes</th>
          <th v-if="visibleCols.pt_sale">Sale #</th>
          <th class="col-actions col-actions-menu-only">
            <div class="col-toggle-wrap">
              <button class="col-icon-btn" @click.stop="colMenuOpen = !colMenuOpen" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
              <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
              <div v-if="colMenuOpen" class="col-menu">
                <div class="col-menu-title">Columns</div>
                <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
              </div>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in paginatedData" :key="p.id">
          <td v-if="visibleCols.pt_date">{{ new Date(p.date).toLocaleString() }}</td>
          <td v-if="visibleCols.pt_points" :class="p.points > 0 ? 'points-plus' : 'points-minus'">
            {{ p.points > 0 ? '+' : '' }}{{ p.points }}
          </td>
          <td v-if="visibleCols.pt_type">{{ p.type }}</td>
          <td v-if="visibleCols.pt_description">{{ p.description || '-' }}</td>
          <td v-if="visibleCols.pt_sale">
            <span
              v-if="p.related_sale_id"
              class="sale-link"
              @click="openSaleModal(sales.find(s => s.id === p.related_sale_id))"
            >
              #{{ p.related_sale_id }}
            </span>
            <span v-else>—</span>
          </td>
          <td class="col-actions col-actions-menu-only"></td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- PURCHASE HISTORY -->
    <div v-if="activeTab === 'purchases'" class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
    <table>
      <thead>
        <tr>
          <th v-if="visibleCols.pu_date">Date</th>
          <th v-if="visibleCols.pu_id">Sale #</th>
          <th v-if="visibleCols.pu_total">Total</th>
          <th v-if="visibleCols.pu_status">Status</th>
          <th class="col-actions col-actions-menu-only">
            <div class="col-toggle-wrap">
              <button class="col-icon-btn" @click.stop="colMenuOpen = !colMenuOpen" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
              <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
              <div v-if="colMenuOpen" class="col-menu">
                <div class="col-menu-title">Columns</div>
                <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
              </div>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="s in paginatedData"
          :key="s.id"
          @click="openSaleModal(s)"
          style="cursor:pointer"
        >
          <td v-if="visibleCols.pu_date">{{ new Date(s.created_at).toLocaleString() }}</td>
          <td v-if="visibleCols.pu_id">#{{ s.id }}</td>
          <td v-if="visibleCols.pu_total">₱{{ (s.final_total || 0).toFixed(2) }}</td>
          <td v-if="visibleCols.pu_status">
            <span
              :class="{
                'status-success': s.status === 'completed',
                'status-voided': s.status === 'voided'
              }"
            >
              {{ s.status }}
            </span>
          </td>
          <td class="col-actions col-actions-menu-only"></td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- PAGINATION -->
    <Pagination v-model:page="currentPage" :total-pages="totalPages" :max-pages="5" />

    <!-- SALE MODAL -->
    <div v-if="showSaleModal" class="modal-overlay app-modal-backdrop">
      <div class="modal app-modal-panel modal-lg">
        <div class="sale-header">
          <div>
            <h2>Sale #{{ selectedSale.id }}</h2>
            <div class="sale-meta">
              {{ salePurchasedAt ? new Date(salePurchasedAt).toLocaleString() : '' }}
            </div>
            <div class="sale-meta">
              Customer: {{ saleCustomer ? saleCustomer.name : 'Walk-in' }}
            </div>
            <div class="sale-meta">
              Payment: {{ selectedSale.payment_method || 'Cash' }}
            </div>
          </div>

          <span
            class="badge"
            :class="selectedSale.status === 'voided' ? 'badge-voided' : 'badge-ok'"
          >
            {{ saleStatusLabel }}
          </span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in selectedSaleItems" :key="item.id">
                <td>{{ item.medicine_name }}</td>
                <td>{{ item.quantity }}</td>
                <td>₱{{ item.price_at_sale.toFixed(2) }}</td>
                <td>₱{{ (item.quantity * item.price_at_sale).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="sale-summary">
          <div>Subtotal: ₱{{ Number(selectedSale.total_amount || 0).toFixed(2) }}</div>
          <div>Professional Fee: ₱{{ Number(selectedSale.professional_fee || 0).toFixed(2) }}</div>
          <div>Discount: ₱{{ saleDiscountAmount.toFixed(2) }}</div>
          <div><strong>Total: ₱{{ Number(selectedSale.final_total || 0).toFixed(2) }}</strong></div>

          <hr />

          <div>Money Given: ₱{{ Number(selectedSale.money_given || 0).toFixed(2) }}</div>
          <div>Change: ₱{{ Number(selectedSale.change || 0).toFixed(2) }}</div>
        </div>

        <button class="secondary btn-block-mobile" @click="closeSaleModal">Close</button>
      </div>
    </div>


  </div>
</template>

<style scoped>
  /* ======================
   PAGE
====================== */
.medicines-page {
  margin: auto;
  padding: 20px;
  overflow-x: hidden;
  height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;
}

.page-subtitle {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 14px;
}

body.dark-mode .page-subtitle {
  color: #94a3b8;
}

.customer-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.customer-summary-card {
  padding: 16px 18px;
  border: 1px solid #dbe6e2;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fffc 100%);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

body.dark-mode .customer-summary-card {
  background: linear-gradient(180deg, #162520 0%, #121b18 100%);
  border-color: #244034;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}

.points-card {
  align-items: flex-end;
  text-align: right;
}

.summary-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #1a8a6e;
}

.summary-value {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
}

body.dark-mode .summary-value {
  color: #f8fafc;
}

/* ======================
   TABS
====================== */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

/* ======================
   POINT COLORS
====================== */
.points-plus {
  color: #1abc9c;
  font-weight: 600;
}

.points-minus {
  color: #e74c3c;
  font-weight: 600;
}

/* ======================
   SALE LINK
====================== */
.sale-link {
  color: #3498db;
  font-weight: 600;
  cursor: pointer;
}

.sale-link:hover {
  text-decoration: underline;
}

/* ======================
   MODAL
====================== */
.modal {
  min-width: 320px;
  max-width: 90vw;
}

/* ======================
   SALE STATUS COLORS
====================== */
.status-success {
  color: #1abc9c;
  font-weight: 600;
}

.status-voided {
  color: #e74c3c;
  font-weight: 600;
}

/* Calendar icon trigger */
:deep(.dp__main) {
  display: inline-flex;
  width: auto;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .customer-summary {
    grid-template-columns: 1fr;
  }

  .points-card {
    align-items: flex-start;
    text-align: left;
  }

}
.date-clear {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  background: #e74c3c;
  color: #fff;
  border-radius: 50%;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  font-style: normal;
  cursor: pointer;
}
.date-clear:hover { background: #c0392b; }

</style>