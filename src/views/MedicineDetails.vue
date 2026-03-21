<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MedicineForm from '../components/MedicineForm.vue'
import Pagination from '../components/Pagination.vue'
import SearchInput from '../components/SearchInput.vue'
import { dbPromise } from '../db'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { format } from 'date-fns'
import { collectFromSource } from '../db/query'

const route = useRoute()
const router = useRouter()

const medicineId = computed(() => Number(route.params.id))

const medicine = ref(null)
const stockEntries = ref([])
const priceEntries = ref([])
const showForm = ref(false)
const editingMedicine = ref(null)

const activeTab = ref(route.query.tab === 'prices' ? 'prices' : 'stock')
const startDate = ref('')
const endDate = ref('')
const dateRange = ref(null)
const isDark = ref(localStorage.getItem('darkMode') === 'true')
const searchKeyword = ref('')
const sortOrder = ref('desc')
const currentPage = ref(1)
const itemsPerPage = ref(10)
const itemsPerPageOptions = [5, 10, 20, 50]
const colMenuOpen = ref(false)

const _detailDefaultCols = {
  stock_date: true,
  stock_qty: true,
  stock_expiry: true,
  price_date: true,
  price_regular: true,
  price_discount: true,
}

const visibleCols = ref({
  ..._detailDefaultCols,
  ...JSON.parse(localStorage.getItem('col-vis-medicine-details') || '{}')
})

watch(visibleCols, value => {
  localStorage.setItem('col-vis-medicine-details', JSON.stringify(value))
}, { deep: true })

watch(dateRange, (range) => {
  if (range && range[0] && range[1]) {
    startDate.value = format(range[0], 'yyyy-MM-dd')
    endDate.value = format(range[1], 'yyyy-MM-dd')
  } else {
    startDate.value = ''
    endDate.value = ''
  }
})

const stockCols = [
  { key: 'stock_date', label: 'Date' },
  { key: 'stock_qty', label: 'Qty' },
  { key: 'stock_expiry', label: 'Expiry' },
]

const priceCols = [
  { key: 'price_date', label: 'Date' },
  { key: 'price_regular', label: 'Regular' },
  { key: 'price_discount', label: 'Discount' },
]

const activeCols = computed(() => activeTab.value === 'stock' ? stockCols : priceCols)

const lastVisibleColumnKey = computed(() => {
  const visibleActiveCols = activeCols.value.filter(col => visibleCols.value[col.key])
  return visibleActiveCols.at(-1)?.key || activeCols.value.at(-1)?.key || null
})

const visibleColumnCount = computed(() => {
  const count = activeCols.value.filter(col => visibleCols.value[col.key]).length
  return Math.max(1, count)
})

const toggleCol = (key) => {
  visibleCols.value[key] = !visibleCols.value[key]
}

const toggleColumnMenu = () => {
  colMenuOpen.value = !colMenuOpen.value
}

const formatDateTime = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

const formatDateOnly = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

const toMoney = (value) => `₱${Number(value || 0).toFixed(2)}`

const getPrice1 = (entry) => Number(entry.price1 ?? entry.new_price1 ?? entry.old_price1 ?? 0)
const getPrice2 = (entry) => Number(entry.price2 ?? entry.new_price2 ?? entry.old_price2 ?? 0)

const loadMedicineData = async () => {
  const db = await dbPromise
  const currentMedicine = await db.get('medicines', medicineId.value)

  if (!currentMedicine) {
    medicine.value = null
    stockEntries.value = []
    priceEntries.value = []
    return
  }

  medicine.value = currentMedicine

  const stockIndex = db.transaction('inventory_batches').objectStore('inventory_batches').index('medicine_id')
  const allStock = await collectFromSource(stockIndex, { query: IDBKeyRange.only(medicineId.value) })
  stockEntries.value = allStock.sort((left, right) => new Date(right.created_at) - new Date(left.created_at))

  const priceIndex = db.transaction('price_history').objectStore('price_history').index('medicine_id')
  const allPrices = await collectFromSource(priceIndex, { query: IDBKeyRange.only(medicineId.value) })
  priceEntries.value = allPrices.sort((left, right) => new Date(right.changed_at) - new Date(left.changed_at))
}

onMounted(loadMedicineData)

watch(() => route.params.id, () => {
  loadMedicineData()
})

watch(activeTab, (tab) => {
  currentPage.value = 1
  colMenuOpen.value = false
  router.replace({ query: { ...route.query, tab } })
})

watch([searchKeyword, startDate, endDate, sortOrder, itemsPerPage], () => {
  currentPage.value = 1
})

const totalStock = computed(() =>
  stockEntries.value.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)
)

const latestPriceEntry = computed(() => priceEntries.value[0] || null)

const stockStatus = computed(() => {
  if (totalStock.value <= 0) return 'Out of stock'
  if (totalStock.value < 10) return 'Low stock'
  return 'In stock'
})

const filteredStockEntries = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const entries = [...stockEntries.value]

  const filteredByDate = entries.filter(entry => {
    const entryDate = new Date(entry.created_at)

    if (startDate.value) {
      const from = new Date(startDate.value)
      if (entryDate < from) return false
    }

    if (endDate.value) {
      const to = new Date(`${endDate.value}T23:59:59`)
      if (entryDate > to) return false
    }

    return true
  })

  const filtered = keyword
    ? filteredByDate.filter(entry => {
        const haystack = [
          entry.created_at,
          entry.expiry_date,
          String(entry.quantity ?? ''),
        ].join(' ').toLowerCase()

        return haystack.includes(keyword)
      })
    : filteredByDate

  return filtered.sort((left, right) =>
    sortOrder.value === 'asc'
      ? new Date(left.created_at) - new Date(right.created_at)
      : new Date(right.created_at) - new Date(left.created_at)
  )
})

const filteredPriceEntries = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const entries = [...priceEntries.value]

  const filteredByDate = entries.filter(entry => {
    const entryDate = new Date(entry.changed_at)

    if (startDate.value) {
      const from = new Date(startDate.value)
      if (entryDate < from) return false
    }

    if (endDate.value) {
      const to = new Date(`${endDate.value}T23:59:59`)
      if (entryDate > to) return false
    }

    return true
  })

  const filtered = keyword
    ? filteredByDate.filter(entry => {
        const haystack = [
          entry.changed_at,
          String(getPrice1(entry)),
          String(getPrice2(entry)),
        ].join(' ').toLowerCase()

        return haystack.includes(keyword)
      })
    : filteredByDate

  return filtered.sort((left, right) =>
    sortOrder.value === 'asc'
      ? new Date(left.changed_at) - new Date(right.changed_at)
      : new Date(right.changed_at) - new Date(left.changed_at)
  )
})

const activeList = computed(() => activeTab.value === 'stock' ? filteredStockEntries.value : filteredPriceEntries.value)

const totalPages = computed(() => Math.max(1, Math.ceil(activeList.value.length / itemsPerPage.value)))

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return activeList.value.slice(start, start + itemsPerPage.value)
})

const editMedicine = () => {
  if (!medicine.value) return
  editingMedicine.value = { ...medicine.value }
  showForm.value = true
}

const closeForm = async (saved = false) => {
  showForm.value = false
  editingMedicine.value = null

  if (!saved) return

  await loadMedicineData()
}

const goBack = () => {
  const query = {}
  if (route.query.page) query.page = route.query.page
  if (route.query.search !== undefined) query.search = route.query.search
  if (route.query.filter) query.filter = route.query.filter
  if (route.query.perPage) query.perPage = route.query.perPage
  if (route.query.sortBy) query.sortBy = route.query.sortBy
  if (route.query.sortOrder) query.sortOrder = route.query.sortOrder

  router.push({ name: 'Medicines', query })
}
</script>

<template>
  <div class="medicines-page medicine-details-page">
    <div class="page-header">
      <div>
        <h1>Medicine Details</h1>
        <p class="page-subtitle">Stock activity and price history for the selected medicine.</p>
      </div>
      <div class="page-actions">
        <button v-if="medicine" class="warning" @click="editMedicine">Edit Medicine</button>
        <button class="info back-btn" @click="goBack">← Back to Medicines</button>
      </div>
    </div>

    <template v-if="medicine">
      <div class="customer-summary medicine-summary">
        <div class="customer-summary-card">
          <span class="summary-label">Brand</span>
          <strong class="summary-value">{{ medicine.name }}</strong>
          <span class="summary-meta">{{ medicine.generic_name || 'No generic name' }}</span>
        </div>

        <div class="customer-summary-card points-card">
          <span class="summary-label">Current Stock</span>
          <strong class="summary-value">{{ totalStock }}</strong>
          <span class="summary-meta">{{ stockStatus }}</span>
        </div>

        <div class="customer-summary-card">
          <span class="summary-label">Regular Price</span>
          <strong class="summary-value">{{ toMoney(medicine.price1) }}</strong>
          <span class="summary-meta">Latest saved price</span>
        </div>

        <div class="customer-summary-card points-card">
          <span class="summary-label">Discount Price</span>
          <strong class="summary-value">{{ toMoney(medicine.price2) }}</strong>
          <span class="summary-meta">{{ medicine.is_archived ? 'Archived' : 'Active' }}</span>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-button" :class="{ active: activeTab === 'stock' }" @click="activeTab = 'stock'">
          Stock History
        </button>

        <button class="tab-button" :class="{ active: activeTab === 'prices' }" @click="activeTab = 'prices'">
          Price History
        </button>
      </div>

      <div class="top-bar">
        <SearchInput
          v-model="searchKeyword"
          :placeholder="activeTab === 'stock' ? 'Search stock history...' : 'Search price history...'"
        />

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

        <select v-model="sortOrder" class="select-field">
          <option value="desc">Newest</option>
          <option value="asc">Oldest</option>
        </select>

        <select v-model.number="itemsPerPage" class="select-field">
          <option v-for="o in itemsPerPageOptions" :key="o" :value="o">{{ o }}</option>
        </select>
      </div>

      <div class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
        <table v-if="activeTab === 'stock'">
          <thead>
            <tr>
              <th v-if="visibleCols.stock_date" :class="{ 'header-with-menu': lastVisibleColumnKey === 'stock_date' }">
                <div class="th-actions-head" v-if="lastVisibleColumnKey === 'stock_date'">
                  <span>Date</span>
                  <div class="col-toggle-wrap">
                    <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                    <div v-if="colMenuOpen" class="col-menu">
                      <div class="col-menu-title">Columns</div>
                      <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                    </div>
                  </div>
                </div>
                <template v-else>Date</template>
              </th>
              <th v-if="visibleCols.stock_qty" :class="{ 'header-with-menu': lastVisibleColumnKey === 'stock_qty' }">
                <div class="th-actions-head" v-if="lastVisibleColumnKey === 'stock_qty'">
                  <span>Qty</span>
                  <div class="col-toggle-wrap">
                    <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                    <div v-if="colMenuOpen" class="col-menu">
                      <div class="col-menu-title">Columns</div>
                      <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                    </div>
                  </div>
                </div>
                <template v-else>Qty</template>
              </th>
              <th v-if="visibleCols.stock_expiry" :class="{ 'header-with-menu': lastVisibleColumnKey === 'stock_expiry' }">
                <div class="th-actions-head" v-if="lastVisibleColumnKey === 'stock_expiry'">
                  <span>Expiry</span>
                  <div class="col-toggle-wrap">
                    <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                    <div v-if="colMenuOpen" class="col-menu">
                      <div class="col-menu-title">Columns</div>
                      <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                    </div>
                  </div>
                </div>
                <template v-else>Expiry</template>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in paginatedData" :key="entry.id">
              <td v-if="visibleCols.stock_date">{{ formatDateTime(entry.created_at) }}</td>
              <td v-if="visibleCols.stock_qty" :class="Number(entry.quantity || 0) > 0 ? 'points-plus' : 'points-minus'">{{ entry.quantity }}</td>
              <td v-if="visibleCols.stock_expiry">{{ entry.expiry_date ? formatDateOnly(entry.expiry_date) : 'No Expiry' }}</td>
            </tr>
            <tr v-if="!paginatedData.length">
              <td :colspan="visibleColumnCount" class="empty-state-cell">No stock records found.</td>
            </tr>
          </tbody>
        </table>

        <table v-else>
          <thead>
            <tr>
              <th v-if="visibleCols.price_date" :class="{ 'header-with-menu': lastVisibleColumnKey === 'price_date' }">
                <div class="th-actions-head" v-if="lastVisibleColumnKey === 'price_date'">
                  <span>Date</span>
                  <div class="col-toggle-wrap">
                    <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                    <div v-if="colMenuOpen" class="col-menu">
                      <div class="col-menu-title">Columns</div>
                      <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                    </div>
                  </div>
                </div>
                <template v-else>Date</template>
              </th>
              <th v-if="visibleCols.price_regular" :class="{ 'header-with-menu': lastVisibleColumnKey === 'price_regular' }">
                <div class="th-actions-head" v-if="lastVisibleColumnKey === 'price_regular'">
                  <span>Regular</span>
                  <div class="col-toggle-wrap">
                    <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                    <div v-if="colMenuOpen" class="col-menu">
                      <div class="col-menu-title">Columns</div>
                      <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                    </div>
                  </div>
                </div>
                <template v-else>Regular</template>
              </th>
              <th v-if="visibleCols.price_discount" :class="{ 'header-with-menu': lastVisibleColumnKey === 'price_discount' }">
                <div class="th-actions-head" v-if="lastVisibleColumnKey === 'price_discount'">
                  <span>Discount</span>
                  <div class="col-toggle-wrap">
                    <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                    <div v-if="colMenuOpen" class="col-menu">
                      <div class="col-menu-title">Columns</div>
                      <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                    </div>
                  </div>
                </div>
                <template v-else>Discount</template>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in paginatedData" :key="entry.id">
              <td v-if="visibleCols.price_date">{{ formatDateTime(entry.changed_at) }}</td>
              <td v-if="visibleCols.price_regular">{{ toMoney(getPrice1(entry)) }}</td>
              <td v-if="visibleCols.price_discount">{{ toMoney(getPrice2(entry)) }}</td>
            </tr>
            <tr v-if="!paginatedData.length">
              <td :colspan="visibleColumnCount" class="empty-state-cell">No price history found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Pagination v-model:page="currentPage" :total-pages="totalPages" :max-pages="5" />

      <div class="detail-footnote" v-if="latestPriceEntry && activeTab === 'prices'">
        Latest recorded price change: {{ formatDateTime(latestPriceEntry.changed_at) }}
      </div>
    </template>

    <div v-else class="empty-state-panel">
      <h2>Medicine not found</h2>
      <p>The selected medicine could not be loaded.</p>
      <button class="secondary" @click="goBack">Back to Medicines</button>
    </div>

    <MedicineForm
      v-if="showForm"
      :medicineToEdit="editingMedicine"
      @close="closeForm"
      @saved="closeForm(true)"
    />
  </div>
</template>

<style scoped>
.medicine-details-page {
  height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-top: 28px;
  margin-bottom: 14px;
  align-items: center;
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.page-subtitle {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 14px;
}

body.dark-mode .page-subtitle {
  color: #94a3b8;
}

.medicine-summary {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.customer-summary {
  display: grid;
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

.summary-meta {
  color: #64748b;
  font-size: 13px;
}

body.dark-mode .summary-meta {
  color: #9fb0c2;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.medicine-details-page :deep(.dp__main) {
  display: inline-flex;
  width: auto;
}

.medicine-details-page .table-wrap.table-wrap-menu-open {
  overflow: visible;
  z-index: 30;
}

.medicine-details-page .table-wrap thead th {
  position: relative;
}

.medicine-details-page .header-with-menu {
  padding-right: 52px;
}

.medicine-details-page .th-actions-head {
  justify-content: flex-start;
}

.medicine-details-page .col-toggle-wrap {
  position: absolute;
  top: 50%;
  right: 14px;
  transform: translateY(-50%);
}

.medicine-details-page .col-menu {
  top: calc(100% + 8px);
  right: 0;
  z-index: 400;
}

.points-plus {
  color: #1abc9c;
  font-weight: 600;
}

.points-minus {
  color: #e74c3c;
  font-weight: 600;
}

.empty-state-cell {
  text-align: center;
  color: #64748b;
  padding: 20px 12px;
}

body.dark-mode .empty-state-cell {
  color: #9fb0c2;
}

.detail-footnote {
  margin-top: 10px;
  color: #64748b;
  font-size: 13px;
}

body.dark-mode .detail-footnote {
  color: #9fb0c2;
}

.empty-state-panel {
  max-width: 480px;
  margin: 32px auto;
  padding: 24px;
  border-radius: 18px;
  text-align: center;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

body.dark-mode .empty-state-panel {
  background: #1c1c1c;
  border-color: #2e2e2e;
}

@media (max-width: 1024px) {
  .medicine-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .medicine-details-page .top-bar > :deep(.dp__main),
  .medicine-details-page .top-bar > :deep(.date-icon-btn) {
    width: 100%;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .page-actions {
    width: 100%;
    justify-content: stretch;
  }

  .page-actions > button {
    width: 100%;
  }

  .medicine-summary {
    grid-template-columns: 1fr;
  }

  .points-card {
    align-items: flex-start;
    text-align: left;
  }
}
</style>