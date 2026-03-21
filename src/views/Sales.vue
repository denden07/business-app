<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import SearchInput from '../components/SearchInput.vue'
import Swal from 'sweetalert2'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { downloadCSV } from '../utils/exportCsv'
import Pagination from '../components/Pagination.vue'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { format } from 'date-fns'



const store = useStore()
const router = useRouter()

/* ======================
   SORTING
====================== */
const sortBy = ref('')
const sortOrder = ref('asc') // 'asc' or 'desc'

const toggleSort = (field) => {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortOrder.value = 'asc'
  }
}

/* ======================
   COLUMN VISIBILITY
====================== */
const _salesDefaultCols = { id: true, purchased_date: true, total_amount: true, discount: true, professional_fee: true, final_total: true, payment_method: true, status: true }
const colMenuOpen = ref(false)
const visibleCols = ref({ ..._salesDefaultCols, ...JSON.parse(localStorage.getItem('col-vis-sales') || '{}') })
watch(visibleCols, v => localStorage.setItem('col-vis-sales', JSON.stringify(v)), { deep: true })
const allCols = [
  { key: 'id', label: 'Sale #' },
  { key: 'purchased_date', label: 'Purchased Date' },
  { key: 'total_amount', label: 'Subtotal' },
  { key: 'discount', label: 'Discount' },
  { key: 'professional_fee', label: 'Prof Fee' },
  { key: 'final_total', label: 'Total' },
  { key: 'payment_method', label: 'Payment' },
  { key: 'status', label: 'Status' },
]
const visibleColumnCount = computed(() => allCols.filter(col => visibleCols.value[col.key]).length + 1)
const toggleCol = (key) => { visibleCols.value[key] = !visibleCols.value[key] }

/* ======================
   FILTERS & PAGINATION
====================== */
const searchKeyword = ref('')
const startDate = ref('')
const endDate = ref('')
const dateRange = ref(null)
const isDark = ref(localStorage.getItem('darkMode') === 'true')

watch(dateRange, (range) => {
  if (range && range[0] && range[1]) {
    startDate.value = format(range[0], 'yyyy-MM-dd')
    endDate.value = format(range[1], 'yyyy-MM-dd')
  } else {
    startDate.value = ''
    endDate.value = ''
  }
})

// const currentPage = ref(1)
// const itemsPerPage = ref(10)
const itemsPerPageOptions = [5, 10, 20, 50]

/* ======================
   MODALS
====================== */
const showView = ref(false)

const fmt = (v) => {
  const n = Number(v)
  return isNaN(n) ? '0.00' : n.toFixed(2)
}
/* ======================
   LOAD SALES & CUSTOMERS
====================== */

const loadSales = () => {
  store.dispatch('sales/loadSalesPage', {
    page: currentPage.value,
    itemsPerPage: itemsPerPage.value,
    startDate: startDate.value,
    endDate: endDate.value,
    keyword: searchKeyword.value
  })
}


onMounted(() => {
   loadSales();
})



/* ======================
   VOID SALE
====================== */
const voidSale = async (sale) => {
  try {
    const confirm = await Swal.fire({
      title: 'Void this sale?',
      text: `Sale #${sale.id}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, void it'
    })
    if (!confirm.isConfirmed) return

    await store.dispatch('sales/voidSale', sale)
    Swal.fire('Voided', `Sale #${sale.id} has been voided`, 'success')
    store.dispatch('sales/loadSalesPage', {
      page: currentPage.value,
      itemsPerPage: itemsPerPage.value,
      startDate: startDate.value,
      endDate: endDate.value,
      keyword: searchKeyword.value
    })

  } catch (err) {
    console.error(err)
    Swal.fire('Error', 'Failed to void sale: ' + err.message, 'error')
  }
}

/* ======================
   FILTER + PAGINATION
====================== */
const filteredSales = computed(() =>
  sales.value.filter(s => {
    const saleDate = new Date(s.purchased_date) // convert string -> Date
    const matchesKeyword = !searchKeyword.value || String(s.id).includes(searchKeyword.value)
    const matchesStart = !startDate.value || saleDate >= new Date(startDate.value)
    const matchesEnd = !endDate.value || saleDate <= new Date(endDate.value + 'T23:59:59')
    return matchesKeyword && matchesStart && matchesEnd
  })
)



// const totalPages = computed(() => Math.ceil(filteredSales.value.length / itemsPerPage.value))
// const paginatedSales = computed(() => {
//   const start = (currentPage.value - 1) * itemsPerPage.value
//   return filteredSales.value.slice(start, start + itemsPerPage.value)
// })

// const goPage = (page) => { if (page < 1 || page > totalPages.value) return; currentPage.value = page }
// const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, i) => i + 1))

// watch([searchKeyword, startDate, endDate, itemsPerPage], () => { currentPage.value = 1 })



const goPage = (page) => {
  if (page < 1 || page > totalPages.value) return
  store.commit('sales/SET_CURRENT_PAGE', page)
  loadSales()
}

const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, i) => i + 1))


const currentPage = computed({
  get: () => store.state.sales.currentPage,
  set: (v) => store.commit('sales/SET_CURRENT_PAGE', v)
})

const itemsPerPage = computed({
  get: () => store.state.sales.itemsPerPage,
  set: (v) => {
    store.commit('sales/SET_ITEMS_PER_PAGE', v)
  }
})
const totalSalesCount = computed(() => store.state.sales.totalSalesCount)
const totalPages = computed(() => Math.ceil(totalSalesCount.value / itemsPerPage.value))
const sales = computed(() => {
  const list = store.state.sales.sales
  
  if (!sortBy.value) return list
  
  return [...list].sort((a, b) => {
    let aVal = a[sortBy.value] || ''
    let bVal = b[sortBy.value] || ''
    
    // For payment_method, default to 'Cash' if not set
    if (sortBy.value === 'payment_method') {
      aVal = aVal || 'Cash'
      bVal = bVal || 'Cash'
    }
    
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortOrder.value === 'asc' ? comparison : -comparison
  })
})

const goToHome = () => {
  router.push({ name: 'Home' })
}


const saleStatusLabel = computed(() => {
  if (!selectedSale.value) return ''
  return selectedSale.value.status === 'voided' ? 'VOIDED' : 'COMPLETED'
})

watch([searchKeyword, startDate, endDate, itemsPerPage], () => {
  store.commit('sales/SET_CURRENT_PAGE', 1)
  loadSales()
})

watch(currentPage, () => loadSales())


const saleDetails = computed(() => store.state.sales.saleDetails)
const saleItems = computed(() => saleDetails.value?.items || [])
const saleCustomer = computed(() => saleDetails.value?.customer || null)
const selectedSale = computed(() => saleDetails.value?.sale || {})


async function openSaleModal(sale) {
  await store.dispatch('sales/fetchSaleDetails', sale.id)
  showView.value = true
}

function closeModal() {
  showView.value = false
  store.commit('sales/SET_SALE_DETAILS', null)
}

const exportCSV = async () => {
  if (!startDate.value || !endDate.value) {
    return Swal.fire('Error', 'Select date range first', 'error')
  }

  const { rows, transactionCount, totalSales } =
    await store.dispatch('sales/exportSalesByDateRange', {
      startDate: startDate.value,
      endDate: endDate.value
    })

  downloadCSV(
    `sales_${startDate.value}_to_${endDate.value}.csv`,
    rows,
    [
      `TOTAL_TRANSACTIONS,${transactionCount}`,
      `TOTAL_SALES,${totalSales}`
    ]
  )
}




</script>

<template>
  <div class="medicines-page">
    <h1>Sales</h1>

    <!-- TOP BAR -->
    <div class="top-bar">
      <SearchInput v-model="searchKeyword" placeholder="Search sale #..." />

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

      <select v-model.number="itemsPerPage" class="select-field">
        <option v-for="o in itemsPerPageOptions" :key="o" :value="o">{{ o }}</option>
      </select>

      <button @click="goToHome">Add Sale</button>

      <!-- EXPORT -->
      <button @click="exportCSV" class="secondary">
        Export CSV
      </button>
    </div>



    <!-- TABLE -->
    <div class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
    <table>
      <thead>
        <tr>
          <th v-if="visibleCols.id">Sale #</th>
          <th v-if="visibleCols.purchased_date">Purchased Date</th>
          <th v-if="visibleCols.total_amount">Subtotal</th>
          <th v-if="visibleCols.discount">Discount</th>
          <th v-if="visibleCols.professional_fee">Prof Fee</th>
          <th v-if="visibleCols.final_total">Total</th>
          <th v-if="visibleCols.payment_method" @click="toggleSort('payment_method')" style="cursor: pointer; user-select: none;">
            Payment {{ sortBy === 'payment_method' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
          </th>
          <th v-if="visibleCols.status" @click="toggleSort('status')" style="cursor: pointer; user-select: none;">
            Status {{ sortBy === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
          </th>
          <th class="col-actions">
            <div class="th-actions-head">
              Actions
              <div class="col-toggle-wrap">
                <button class="col-icon-btn" @click.stop="colMenuOpen = !colMenuOpen" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                <div v-if="colMenuOpen" class="col-menu">
                  <div class="col-menu-title">Columns</div>
                  <label v-for="col in allCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                </div>
              </div>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="sale in sales" :key="sale.id">
          <td v-if="visibleCols.id">#{{ sale.id }}</td>
          <td v-if="visibleCols.purchased_date">{{ new Date(sale.purchased_date).toLocaleString() }}</td>
          <td v-if="visibleCols.total_amount">₱{{ fmt(sale.total_amount) }}</td>
          <td v-if="visibleCols.discount">₱{{ fmt(sale.discount) }}</td>
          <td v-if="visibleCols.professional_fee">₱{{ fmt(sale.professional_fee) }}</td>
          <td v-if="visibleCols.final_total"><strong>₱{{ fmt(sale.final_total) }}</strong></td>
          <td v-if="visibleCols.payment_method">{{ sale.payment_method || 'Cash' }}</td>
          <td v-if="visibleCols.status" :class="sale.status === 'voided' ? 'status-voided' : 'status-ok'">{{ sale.status }}</td>
          <td class="col-actions actions-td">
            <button class="info btn" @click="openSaleModal(sale)">View</button>
            <button v-if="sale.status === 'completed'" class="danger btn" @click="voidSale(sale)">Void</button>
          </td>
        </tr>
        <tr v-if="!sales.length">
          <td :colspan="visibleColumnCount" class="empty-state-cell">No sales found.</td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- PAGINATION -->
    <Pagination v-model:page="currentPage" :total-pages="totalPages" :max-pages="5" />

    <!-- VIEW SALE MODAL -->
    <div v-if="showView" class="modal-backdrop app-modal-backdrop">
      <div class="modal app-modal-panel modal-lg">
        <div class="sale-header">
          <div>
            <h2>Sale #{{ selectedSale.id }}</h2>
            <div class="sale-meta">
              {{ new Date(selectedSale.purchased_date).toLocaleString() }}
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
            <tr v-for="item in saleItems" :key="item.id">
              <td>{{ item.medicine_name }}</td>
              <td>{{ item.quantity }}</td>
              <td>₱{{ item.price_at_sale.toFixed(2) }}</td>
              <td>₱{{ (item.quantity * item.price_at_sale).toFixed(2) }}</td>
            </tr>
            <tr v-if="!saleItems.length">
              <td colspan="4" class="empty-state-cell">No sale items found.</td>
            </tr>
          </tbody>
        </table>
        </div>
        <div class="sale-summary">
          <div>Subtotal: ₱{{ selectedSale.total_amount.toFixed(2) }}</div>
          <div>Professional Fee: ₱{{ selectedSale.professional_fee.toFixed(2) }}</div>
          <div>Discount: ₱{{ selectedSale.discount.toFixed(2) }}</div>
          <div><strong>Total: ₱{{ selectedSale.final_total.toFixed(2) }}</strong></div>

          <hr />

          <div>Money Given: ₱{{ (selectedSale.money_given || 0).toFixed(2) }}</div>
          <div>Change: ₱{{ (selectedSale.change || 0).toFixed(2) }}</div>
        </div>

        <button class="secondary btn-block-mobile" @click="closeModal">Close</button>
      </div>
    </div>

  </div>
</template>


<style scoped>
/* Reuse previous styles + voided status */
.medicines-page { margin: auto; padding: 20px; overflow-x: hidden; }

.actions-td button { padding: 6px 10px; }

.status-ok { color: #1abc9c; font-weight: 600; }
.status-voided { color: #e74c3c; font-weight: 700; }

.med-name { font-weight: 600; }
.med-generic { font-size: 13px; color: #666; }
body.dark-mode .med-generic { color: #aaa; }

@media (max-width: 768px) {
  .top-bar > :deep(.date-icon-btn) { width: 100%; }
}

/* Make the datepicker root shrink-wrap its trigger so it sits inline */
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
