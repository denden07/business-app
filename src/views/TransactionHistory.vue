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
import { collectFromSource } from '../db/query'
import { getLocalDayStart } from '../utils/dateRange'
import {
  getTemplateCustomerSectionLabel,
  getTemplatePaymentLabel,
  getTemplateProfessionalFeeLabel,
  isLoyaltyEnabled,
} from '../utils/templatePresentation'

const route = useRoute()
const store = useStore()

const router = useRouter()

const customerId = Number(route.params.id)
const customerPoints = ref(0)
const activeTemplate = computed(() => store.getters['template/activeTemplate'] || {})
const templateLabels = computed(() => activeTemplate.value.labels || {})
const loyaltyEnabled = computed(() => isLoyaltyEnabled(activeTemplate.value))
const customerSectionLabel = computed(() => getTemplateCustomerSectionLabel(templateLabels.value))
const professionalFeeLabel = computed(() => getTemplateProfessionalFeeLabel(templateLabels.value))
const formatPaymentMethod = (value) => getTemplatePaymentLabel(value, templateLabels.value)

function normalizeTab(value) {
  if (!loyaltyEnabled.value) {
    return 'purchases'
  }

  return value === 'purchases' ? 'purchases' : 'points'
}

/* ======================
   STATE
====================== */
const activeTab = ref('purchases')
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
const lastVisibleColumnKey = computed(() => {
  const visibleActiveCols = activeCols.value.filter(col => visibleCols.value[col.key])
  return visibleActiveCols.at(-1)?.key || activeCols.value.at(-1)?.key || null
})
const visibleColumnCount = computed(() => Math.max(1, activeCols.value.filter(col => visibleCols.value[col.key]).length))
const toggleCol = (key) => { visibleCols.value[key] = !visibleCols.value[key] }
const toggleColumnMenu = () => {
  colMenuOpen.value = !colMenuOpen.value
}
const showSaleModal = ref(false)
const selectedSale = ref(null)
const saleCustomer = ref(null)
const currentCustomer = ref(null)

/* ======================
   WATCHERS
====================== */
watch(dateRange, (range) => {
  if (range && range[0] && range[1]) {
    const normalizedStart = getLocalDayStart(range[0])
    const normalizedEnd = getLocalDayStart(range[1])

    startDate.value = normalizedStart ? format(normalizedStart, 'yyyy-MM-dd') : ''
    endDate.value = normalizedEnd ? format(normalizedEnd, 'yyyy-MM-dd') : ''
  } else {
    startDate.value = ''
    endDate.value = ''
  }
})

watch(activeTab, () => {
  currentPage.value = 1
  colMenuOpen.value = false
  loadActiveTab()
})

watch(loyaltyEnabled, enabled => {
  if (!enabled && activeTab.value !== 'purchases') {
    activeTab.value = 'purchases'
  }
}, { immediate: true })

watch([startDate, endDate, sortOrder, itemsPerPage], () => {
  currentPage.value = 1
  loadActiveTab()
})

watch(filterType, () => {
  if (activeTab.value !== 'points') return
  currentPage.value = 1
  loadPointsPage()
})

watch(currentPage, () => {
  loadActiveTab()
})

/* ======================
   LOAD DATA
====================== */
onMounted(async () => {
  activeTab.value = normalizeTab(typeof route.query.tab === 'string' ? route.query.tab : 'points')
  const db = await dbPromise
  currentCustomer.value = await db.get('customers', customerId)
  const year = new Date().getFullYear()
  const yearly = await db.get('yearly_points', [customerId, year])
  customerPoints.value = Number(yearly?.points || 0)
  await loadActiveTab()
})

const loadPointsPage = () => store.dispatch('transaction/loadPointsHistoryPage', {
  customerId,
  page: currentPage.value,
  perPage: itemsPerPage.value,
  startDate: startDate.value,
  endDate: endDate.value,
  filterType: filterType.value,
  sortOrder: sortOrder.value
})

const loadSalesPage = () => store.dispatch('transaction/loadSalesPage', {
  customerId,
  page: currentPage.value,
  perPage: itemsPerPage.value,
  startDate: startDate.value,
  endDate: endDate.value,
  sortOrder: sortOrder.value
})

function loadActiveTab() {
  return activeTab.value === 'points' ? loadPointsPage() : loadSalesPage()
}

/* ======================
   VUEX SOURCES
====================== */
const pointsHistory = computed(() =>
  store.state.transaction.pointsHistory
)

const pointsTotal = computed(() =>
  store.state.transaction.pointsTotal
)

const sales = computed(() =>
  store.state.transaction.sales
)

const salesTotal = computed(() =>
  store.state.transaction.salesTotal
)

/* ======================
   FILTERED DATA
====================== */
const activeList = computed(() =>
  activeTab.value === 'points' ? pointsHistory.value : sales.value
)

const activeTotal = computed(() =>
  activeTab.value === 'points' ? pointsTotal.value : salesTotal.value
)
const hasDateRangeFilter = computed(() => Boolean(startDate.value && endDate.value))

const totalPages = computed(() =>
  Math.ceil(activeTotal.value / itemsPerPage.value)
)

const paginatedData = computed(() => activeList.value)
const visibleRowCount = computed(() => paginatedData.value.length)

const goPage = (page) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

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
const selectedSaleItems = ref([])

const openSaleModal = async (saleOrId) => {
  if (!saleOrId) return

  const db = await dbPromise
  const saleId = typeof saleOrId === 'object' ? saleOrId.id : saleOrId
  const sale = typeof saleOrId === 'object'
    ? saleOrId
    : await db.get('sales', saleId)

  if (!sale) return

  // single transaction for sale lines and the unified item catalog
  const tx = db.transaction(['sale_items', 'items'], 'readonly')
  const itemsStore = tx.objectStore('sale_items')
  const itemCatalogStore = tx.objectStore('items')
  const legacyIndex = itemCatalogStore.index('legacy_medicine_id')

  const items = await collectFromSource(itemsStore.index('sale_id'), { query: sale.id })

  for (const item of items) {
    const source = item.item_id
      ? await itemCatalogStore.get(item.item_id)
      : await legacyIndex.get(item.medicine_id)
    item.display_name = source?.name || 'Unknown'
    item.secondary_name = source?.description || ''
    item.medicine_name = item.display_name
    item.generic_name = item.secondary_name
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
  return customerPoints.value
})

const currentCustomerName = computed(() => currentCustomer.value?.name || `Customer #${customerId}`)
</script>

<template>
  <div class="page-shell">
    <div class="page-header">
      <div>
        <h1>Customer Transactions</h1>
        <p class="page-subtitle">{{ loyaltyEnabled ? 'Transaction activity and points history for the selected customer.' : 'Transaction activity for the selected customer.' }}</p>
      </div>

      <button class="info back-btn" @click="goBack">← Back to Customers</button>
    </div>

    <div class="customer-summary">
      <div class="customer-summary-card">
        <span class="summary-label">Current Customer</span>
        <strong class="summary-value">{{ currentCustomerName }}</strong>
      </div>
      <div v-if="loyaltyEnabled" class="customer-summary-card points-card">
        <span class="summary-label">Available Points</span>
        <strong class="summary-value">{{ currentCustomerPoints }}</strong>
      </div>
    </div>

    <!-- TABS -->
    <div class="tabs">
      <button
        v-if="loyaltyEnabled"
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

      <select v-if="loyaltyEnabled && activeTab === 'points'" v-model="filterType" class="select-field">
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
      <!-- <button class="secondary" @click="dateRange = null; filterType='all'">Clear</button> -->
    </div>

    <!-- POINTS HISTORY -->
    <div v-if="loyaltyEnabled && activeTab === 'points'" class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
    <table>
      <thead>
        <tr>
          <th v-if="visibleCols.pt_date" :class="{ 'col-menu-anchor': lastVisibleColumnKey === 'pt_date' }">
            <div class="th-actions-head" v-if="lastVisibleColumnKey === 'pt_date'">
              Date
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
          <th v-if="visibleCols.pt_points" :class="{ 'col-menu-anchor': lastVisibleColumnKey === 'pt_points' }">
            <div class="th-actions-head" v-if="lastVisibleColumnKey === 'pt_points'">
              Points
              <div class="col-toggle-wrap">
                <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                <div v-if="colMenuOpen" class="col-menu">
                  <div class="col-menu-title">Columns</div>
                  <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                </div>
              </div>
            </div>
            <template v-else>Points</template>
          </th>
          <th v-if="visibleCols.pt_type" :class="{ 'col-menu-anchor': lastVisibleColumnKey === 'pt_type' }">
            <div class="th-actions-head" v-if="lastVisibleColumnKey === 'pt_type'">
              Type
              <div class="col-toggle-wrap">
                <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                <div v-if="colMenuOpen" class="col-menu">
                  <div class="col-menu-title">Columns</div>
                  <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                </div>
              </div>
            </div>
            <template v-else>Type</template>
          </th>
          <th v-if="visibleCols.pt_description" :class="{ 'col-menu-anchor': lastVisibleColumnKey === 'pt_description' }">
            <div class="th-actions-head" v-if="lastVisibleColumnKey === 'pt_description'">
              Notes
              <div class="col-toggle-wrap">
                <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                <div v-if="colMenuOpen" class="col-menu">
                  <div class="col-menu-title">Columns</div>
                  <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                </div>
              </div>
            </div>
            <template v-else>Notes</template>
          </th>
          <th v-if="visibleCols.pt_sale" :class="{ 'col-menu-anchor': lastVisibleColumnKey === 'pt_sale' }">
            <div class="th-actions-head" v-if="lastVisibleColumnKey === 'pt_sale'">
              Sale #
              <div class="col-toggle-wrap">
                <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                <div v-if="colMenuOpen" class="col-menu">
                  <div class="col-menu-title">Columns</div>
                  <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                </div>
              </div>
            </div>
            <template v-else>Sale #</template>
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
              @click.stop="openSaleModal(p.related_sale_id)"
            >
              #{{ p.related_sale_id }}
            </span>
            <span v-else>—</span>
          </td>
        </tr>
        <tr v-if="!paginatedData.length">
          <td :colspan="visibleColumnCount" class="empty-state-cell">No points history found.</td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- PURCHASE HISTORY -->
    <div v-if="activeTab === 'purchases'" class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
    <table>
      <thead>
        <tr>
          <th v-if="visibleCols.pu_date" :class="{ 'col-menu-anchor': lastVisibleColumnKey === 'pu_date' }">
            <div class="th-actions-head" v-if="lastVisibleColumnKey === 'pu_date'">
              Date
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
          <th v-if="visibleCols.pu_id" :class="{ 'col-menu-anchor': lastVisibleColumnKey === 'pu_id' }">
            <div class="th-actions-head" v-if="lastVisibleColumnKey === 'pu_id'">
              Sale #
              <div class="col-toggle-wrap">
                <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                <div v-if="colMenuOpen" class="col-menu">
                  <div class="col-menu-title">Columns</div>
                  <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                </div>
              </div>
            </div>
            <template v-else>Sale #</template>
          </th>
          <th v-if="visibleCols.pu_total" :class="{ 'col-menu-anchor': lastVisibleColumnKey === 'pu_total' }">
            <div class="th-actions-head" v-if="lastVisibleColumnKey === 'pu_total'">
              Total
              <div class="col-toggle-wrap">
                <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                <div v-if="colMenuOpen" class="col-menu">
                  <div class="col-menu-title">Columns</div>
                  <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                </div>
              </div>
            </div>
            <template v-else>Total</template>
          </th>
          <th v-if="visibleCols.pu_status" :class="{ 'col-menu-anchor': lastVisibleColumnKey === 'pu_status' }">
            <div class="th-actions-head" v-if="lastVisibleColumnKey === 'pu_status'">
              Status
              <div class="col-toggle-wrap">
                <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                <div v-if="colMenuOpen" class="col-menu">
                  <div class="col-menu-title">Columns</div>
                  <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                </div>
              </div>
            </div>
            <template v-else>Status</template>
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
        </tr>
        <tr v-if="!paginatedData.length">
          <td :colspan="visibleColumnCount" class="empty-state-cell">No purchase history found.</td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- PAGINATION -->
    <Pagination v-model:page="currentPage" :total-pages="totalPages" :max-pages="5" :item-count="hasDateRangeFilter ? visibleRowCount : null" :total-items="hasDateRangeFilter ? activeTotal : null" />

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
              {{ customerSectionLabel }}: {{ saleCustomer ? saleCustomer.name : 'Walk-in' }}
            </div>
            <div class="sale-meta">
              Payment: {{ formatPaymentMethod(selectedSale.payment_method) }}
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
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in selectedSaleItems" :key="item.id">
                <td>{{ item.display_name || item.medicine_name }}</td>
                <td>{{ item.quantity }}</td>
                <td>₱{{ item.price_at_sale.toFixed(2) }}</td>
                <td>₱{{ (item.quantity * item.price_at_sale).toFixed(2) }}</td>
              </tr>
              <tr v-if="!selectedSaleItems.length">
                <td colspan="4" class="empty-state-cell">No sale items found.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="sale-summary">
          <div>Subtotal: ₱{{ Number(selectedSale.total_amount || 0).toFixed(2) }}</div>
          <div v-if="Number(selectedSale.professional_fee || 0) > 0">{{ professionalFeeLabel }}: ₱{{ Number(selectedSale.professional_fee || 0).toFixed(2) }}</div>
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
.page-shell {
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
  margin-top: 28px;
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