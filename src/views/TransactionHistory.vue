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

  await tx.done

  selectedSale.value = sale
  selectedSaleItems.value = items
  showSaleModal.value = true
}




const closeSaleModal = () => {
  showSaleModal.value = false
  selectedSale.value = null
}
</script>

<template>
  <div class="medicines-page">
    <h1>Customer Transactions</h1>

    <div class="top-bar">
      <button class="info back-btn" @click="goBack">← Back to Customers</button>
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

      <select v-if="activeTab === 'points'" v-model="filterType">
        <option value="all">All Types</option>
        <option value="sale">Sale</option>
        <option value="manual">Manual</option>
      </select>

      <select v-model="sortOrder">
        <option value="desc">Newest</option>
        <option value="asc">Oldest</option>
      </select>
      <select v-model.number="itemsPerPage">
        <option v-for="o in itemsPerPageOptions" :key="o" :value="o">
          {{ o }}
        </option>
      </select>
      <button class="secondary" @click="dateRange = null; filterType='all'">Clear</button>
    </div>

    <!-- POINTS HISTORY -->
    <div v-if="activeTab === 'points'" class="table-wrap">
    <table>
      <thead>
        <tr>
          <th v-if="visibleCols.pt_date">Date</th>
          <th v-if="visibleCols.pt_points">Points</th>
          <th v-if="visibleCols.pt_type">Type</th>
          <th v-if="visibleCols.pt_description">Notes</th>
          <th v-if="visibleCols.pt_sale">Sale #</th>
          <th class="col-actions">
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
          <td class="col-actions"></td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- PURCHASE HISTORY -->
    <div v-if="activeTab === 'purchases'" class="table-wrap">
    <table>
      <thead>
        <tr>
          <th v-if="visibleCols.pu_date">Date</th>
          <th v-if="visibleCols.pu_id">Sale #</th>
          <th v-if="visibleCols.pu_total">Total</th>
          <th v-if="visibleCols.pu_status">Status</th>
          <th class="col-actions">
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
          <td class="col-actions"></td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- PAGINATION -->
    <Pagination v-model:page="currentPage" :total-pages="totalPages" :max-pages="5" />

    <!-- SALE MODAL -->
    <div v-if="showSaleModal" class="modal-overlay">
      <div class="modal">
        <h2>Sale #{{ selectedSale.id }}</h2>
        <p>Date: {{ new Date(selectedSale.created_at).toLocaleString() }}</p>
        <p>Status: {{ selectedSale.status || 'completed' }}</p>

        <hr/>
        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in selectedSaleItems" :key="item.id">
              <td>{{ item.medicine_name }} <small v-if="item.generic_name">{{ item.generic_name }}</small></td>
              <td>₱{{ item.price_at_sale.toFixed(2) }}</td>
              <td>{{ item.quantity }}</td>
              <td>₱{{ (item.price_at_sale * item.quantity).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>

        <hr/>
        <p>Subtotal: ₱{{ selectedSale.total_amount.toFixed(2) }}</p>
        <p>Professional Fee: ₱{{ selectedSale.professional_fee.toFixed(2) }}</p>
        <p>Discount (Points): -₱{{ selectedSale.points_discount?.toFixed(2) || 0 }}</p>
        <p><strong>Final Total: ₱{{ selectedSale.final_total.toFixed(2) }}</strong></p>
        <p>Money Given: ₱{{ selectedSale.money_given.toFixed(2) }}</p>
        <p>Change: ₱{{ selectedSale.change.toFixed(2) }}</p>

        <button class="secondary" @click="showSaleModal = false">Close</button>
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

body.dark-mode .medicines-page {
  background-color: #121212;
  color: #eee;
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
   TOP BAR
====================== */
.top-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.top-bar input,
.top-bar select {
  min-height: 40px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #ccc;
  background: #fff;
  color: #222;
}

body.dark-mode .top-bar input,
body.dark-mode .top-bar select {
  background: #1c1c1c;
  border-color: #333;
  color: #eee;
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
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.6);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 40px 20px;
  overflow-y: auto;
  z-index: 999;
}

.modal {
  background: #fff;
  padding: 20px;
  border-radius: 14px;
  min-width: 320px;
  max-width: 90vw;
  box-shadow: 0 10px 30px rgba(0,0,0,.3);
}

body.dark-mode .modal {
  background: #1c1c1c;
  color: #eee;
}

/* modal content */
.modal h2 {
  margin-top: 0;
  margin-bottom: 10px;
}

.modal p {
  margin: 6px 0;
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