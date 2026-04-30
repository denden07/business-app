<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import SearchInput from '../components/SearchInput.vue'
import Swal from 'sweetalert2'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { downloadCSV } from '../utils/exportCsv'
import Pagination from '../components/Pagination.vue'
import IconActionButton from '../components/IconActionButton.vue'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { format } from 'date-fns'
import { isWithinLocalDateRange } from '../utils/dateRange'
import {
  getTemplateCatalogEntryLabel,
  getTemplateCatalogLabel,
  getTemplateCustomerSectionLabel,
  getTemplatePaymentLabel,
  getTemplateProfessionalFeeLabel,
  normalizePaymentMethod,
} from '../utils/templatePresentation'
import {
  canSettleDebtSale,
  getSaleAmountPaid,
  getSaleDisplayStatus,
  getSaleOutstandingBalance,
} from '../utils/saleStatus'
import { openDebtSettlementPrompt } from '../utils/debtSettlementPrompt'
import { getSaleOptionUnitQuantity } from '../utils/itemSaleOptions'



const store = useStore()
const router = useRouter()
const activeTemplate = computed(() => store.getters['template/activeTemplate'] || {})
const templateLabels = computed(() => activeTemplate.value.labels || {})
const templatePayments = computed(() => activeTemplate.value.payments || {})
const catalogLabel = computed(() => getTemplateCatalogLabel(templateLabels.value))
const catalogEntryLabel = computed(() => getTemplateCatalogEntryLabel(templateLabels.value))
const professionalFeeLabel = computed(() => getTemplateProfessionalFeeLabel(templateLabels.value))
const customerSectionLabel = computed(() => getTemplateCustomerSectionLabel(templateLabels.value))
const formatPaymentMethod = (value) => getTemplatePaymentLabel(value, templateLabels.value)
const debtPaymentOptions = computed(() => {
  const configuredMethods = Array.isArray(templatePayments.value.methods) && templatePayments.value.methods.length
    ? templatePayments.value.methods
    : ['cash', 'gcash']

  return configuredMethods.map(method => ({
    value: method,
    label: formatPaymentMethod(method),
  }))
})

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
const allCols = computed(() => [
  { key: 'id', label: 'Sale #' },
  { key: 'purchased_date', label: 'Purchased Date' },
  { key: 'total_amount', label: 'Subtotal' },
  { key: 'discount', label: 'Discount' },
  { key: 'professional_fee', label: professionalFeeLabel.value },
  { key: 'final_total', label: 'Total' },
  { key: 'payment_method', label: 'Payment' },
  { key: 'status', label: 'Status' },
])
const visibleColumnCount = computed(() => allCols.value.filter(col => visibleCols.value[col.key]).length + 1)
const toggleCol = (key) => { visibleCols.value[key] = !visibleCols.value[key] }

/* ======================
   FILTERS & PAGINATION
====================== */
const searchKeyword = ref('')
const statusFilter = ref('all')
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

const formatSaleItemQuantity = (item) => {
  const unitQuantity = getSaleOptionUnitQuantity({ unit_quantity: item.unit_quantity || 1 })
  const totalPieces = Number(item.quantity_in_base_units || (Number(item.quantity || 0) * unitQuantity))
  return unitQuantity > 1 ? `${Number(item.quantity || 0)} units (${totalPieces} pcs)` : `${Number(item.quantity || 0)} pcs`
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
    keyword: searchKeyword.value,
    statusFilter: statusFilter.value,
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
    return matchesKeyword && isWithinLocalDateRange(saleDate, startDate.value, endDate.value)
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
const hasDateRangeFilter = computed(() => Boolean(startDate.value && endDate.value))
const totalSalesCount = computed(() => store.state.sales.totalSalesCount)
const totalPages = computed(() => Math.ceil(totalSalesCount.value / itemsPerPage.value))
const visibleSalesCount = computed(() => sales.value.length)
const sales = computed(() => {
  const list = store.state.sales.sales
  
  if (!sortBy.value) return list
  
  return [...list].sort((a, b) => {
    let aVal = a[sortBy.value] || ''
    let bVal = b[sortBy.value] || ''
    
    // For payment_method, default to 'Cash' if not set
    if (sortBy.value === 'payment_method') {
      aVal = normalizePaymentMethod(aVal)
      bVal = normalizePaymentMethod(bVal)
    }
    
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortOrder.value === 'asc' ? comparison : -comparison
  })
})

const goToHome = () => {
  router.push({ name: 'Home' })
}

const getDisplayStatus = (sale) => getSaleDisplayStatus(sale)
const getStatusPillClass = (sale) => {
  const displayStatus = getDisplayStatus(sale)
  if (displayStatus === 'voided') return 'status-pill status-pill-voided'
  if (displayStatus === 'debt') return 'status-pill status-pill-debt'
  return 'status-pill status-pill-ok'
}

const getPaymentPillClass = (paymentMethod) => {
  const normalizedMethod = normalizePaymentMethod(paymentMethod)

  if (normalizedMethod === 'cash') return 'payment-pill payment-pill-cash'
  if (normalizedMethod === 'gcash') return 'payment-pill payment-pill-gcash'
  if (normalizedMethod === 'maya') return 'payment-pill payment-pill-maya'
  if (normalizedMethod === 'card') return 'payment-pill payment-pill-card'
  if (normalizedMethod === 'bank_transfer') return 'payment-pill payment-pill-bank'
  return 'payment-pill payment-pill-default'
}


const saleStatusLabel = computed(() => {
  if (!selectedSale.value) return ''
  return getDisplayStatus(selectedSale.value).toUpperCase()
})

watch([searchKeyword, statusFilter, startDate, endDate, itemsPerPage], () => {
  store.commit('sales/SET_CURRENT_PAGE', 1)
  loadSales()
})

watch(currentPage, () => loadSales())


const saleDetails = computed(() => store.state.sales.saleDetails)
const saleItems = computed(() => saleDetails.value?.items || [])
const saleCustomer = computed(() => saleDetails.value?.customer || null)
const debtPayments = computed(() => saleDetails.value?.debtPayments || [])
const selectedSale = computed(() => saleDetails.value?.sale || {})
const selectedSaleAmountPaid = computed(() => getSaleAmountPaid(selectedSale.value))
const selectedSaleOutstandingBalance = computed(() => getSaleOutstandingBalance(selectedSale.value))
const canSettleSelectedSale = computed(() => canSettleDebtSale(selectedSale.value))


async function openSaleModal(sale) {
  await store.dispatch('sales/fetchSaleDetails', sale.id)
  showView.value = true
}

function closeModal() {
  showView.value = false
  store.commit('sales/SET_SALE_DETAILS', null)
}

async function settleDebtSale() {
  if (!canSettleSelectedSale.value) return

  const settlement = await openDebtSettlementPrompt({
    outstandingBalance: selectedSaleOutstandingBalance.value,
    paymentOptions: debtPaymentOptions.value,
    title: `Settle Sale #${selectedSale.value.id}`,
  })

  if (!settlement) return

  try {
    const result = await store.dispatch('sales/settleDebtSale', {
      saleId: selectedSale.value.id,
      amount: settlement.amount,
      payment_method: settlement.paymentMethod,
      note: settlement.note,
    })

    await loadSales()

    await Swal.fire({
      icon: 'success',
      title: result.remainingBalance > 0 ? 'Partial payment recorded' : 'Debt fully settled',
      text: result.remainingBalance > 0
        ? `Remaining balance: ₱${result.remainingBalance.toFixed(2)}`
        : 'This sale is now fully paid.',
      timer: 1600,
      showConfirmButton: false,
    })
  } catch (error) {
    await Swal.fire('Error', error.message || 'Failed to record debt payment.', 'error')
  }
}

const exportCSV = async () => {
  const { rows, transactionCount, totalSales } =
    await store.dispatch('sales/exportSalesByDateRange', {
      startDate: startDate.value,
      endDate: endDate.value,
      keyword: searchKeyword.value,
      statusFilter: statusFilter.value,
    })

  if (!rows.length) {
    return Swal.fire('Error', 'No sales match the current filters', 'error')
  }

  const filenameParts = ['sales']
  if (statusFilter.value !== 'all') {
    filenameParts.push(statusFilter.value)
  }
  if (startDate.value || endDate.value) {
    filenameParts.push(startDate.value || 'start')
    filenameParts.push('to')
    filenameParts.push(endDate.value || 'end')
  }
  if (searchKeyword.value) {
    filenameParts.push(`search-${String(searchKeyword.value).trim().replace(/\s+/g, '-')}`)
  }

  downloadCSV(
    `${filenameParts.join('_')}.csv`,
    rows,
    [
      `TOTAL_TRANSACTIONS,${transactionCount}`,
      `TOTAL_SALES,${totalSales}`
    ]
  )
}




</script>

<template>
  <div class="page-shell">
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

      <select v-model="statusFilter" class="select-field">
        <option value="all">All Statuses</option>
        <option value="completed">Completed</option>
        <option value="debt">Unpaid / Debt</option>
        <option value="voided">Voided</option>
      </select>

      <button @click="goToHome">Add Sale</button>

      <!-- EXPORT -->
      <button @click="exportCSV" class="secondary">
        Export CSV
      </button>
    </div>



    <!-- TABLE -->
    <div class="table-wrap sales-table-shell" :class="{ 'table-wrap-menu-open': colMenuOpen }">
    <table>
      <thead>
        <tr>
          <th v-if="visibleCols.id">Sale #</th>
          <th v-if="visibleCols.purchased_date">Purchased Date</th>
          <th v-if="visibleCols.total_amount">Subtotal</th>
          <th v-if="visibleCols.discount">Discount</th>
          <th v-if="visibleCols.professional_fee">{{ professionalFeeLabel }}</th>
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
          <td v-if="visibleCols.payment_method">
            <span :class="[getPaymentPillClass(sale.payment_method), { 'payment-pill-dark': isDark }]">
              {{ formatPaymentMethod(sale.payment_method) }}
            </span>
          </td>
          <td v-if="visibleCols.status">
            <span :class="[getStatusPillClass(sale), { 'status-pill-dark': isDark }]">
              {{ getDisplayStatus(sale) }}
            </span>
          </td>
          <td class="col-actions actions-td">
            <IconActionButton icon="view" label="View sale" variant="info" @click="openSaleModal(sale)" />
            <IconActionButton v-if="sale.status === 'completed'" icon="void" label="Void sale" variant="danger" @click="voidSale(sale)" />
          </td>
        </tr>
        <tr v-if="!sales.length">
          <td :colspan="visibleColumnCount" class="empty-state-cell">No sales found.</td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- PAGINATION -->
    <Pagination v-model:page="currentPage" :total-pages="totalPages" :max-pages="5" :item-count="hasDateRangeFilter ? visibleSalesCount : null" :total-items="hasDateRangeFilter ? totalSalesCount : null" />

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
              {{ customerSectionLabel }}: {{ saleCustomer ? saleCustomer.name : 'Walk-in' }}
            </div>
            <div class="sale-meta">
              Payment: {{ formatPaymentMethod(selectedSale.payment_method) }}
            </div>
          </div>

          <span
            class="badge"
            :class="getDisplayStatus(selectedSale) === 'voided' ? 'badge-voided' : getDisplayStatus(selectedSale) === 'debt' ? 'badge-debt' : 'badge-ok'"
          >
            {{ saleStatusLabel }}
          </span>
        </div>

        <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ catalogEntryLabel }}</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in saleItems" :key="item.id">
              <td>
                {{ item.display_name || item.medicine_name }}
                <div class="sale-meta">{{ item.sale_option_label || item.price_type || 'Regular' }}</div>
              </td>
              <td>{{ formatSaleItemQuantity(item) }}</td>
              <td>₱{{ item.price_at_sale.toFixed(2) }}</td>
              <td>₱{{ (item.quantity * item.price_at_sale).toFixed(2) }}</td>
            </tr>
            <tr v-if="!saleItems.length">
              <td colspan="4" class="empty-state-cell">No {{ catalogLabel.toLowerCase() }} found for this sale.</td>
            </tr>
          </tbody>
        </table>
        </div>
        <div class="sale-summary">
          <div>Subtotal: ₱{{ selectedSale.total_amount.toFixed(2) }}</div>
          <div v-if="Number(selectedSale.professional_fee || 0) > 0">{{ professionalFeeLabel }}: ₱{{ Number(selectedSale.professional_fee || 0).toFixed(2) }}</div>
          <div>Discount: ₱{{ selectedSale.discount.toFixed(2) }}</div>
          <div><strong>Total: ₱{{ selectedSale.final_total.toFixed(2) }}</strong></div>

          <hr />

          <div>Money Given: ₱{{ (selectedSale.money_given || 0).toFixed(2) }}</div>
          <div>Amount Paid: ₱{{ selectedSaleAmountPaid.toFixed(2) }}</div>
          <div v-if="selectedSaleOutstandingBalance > 0">Balance Due: ₱{{ selectedSaleOutstandingBalance.toFixed(2) }}</div>
          <div>Change: ₱{{ (selectedSale.change || 0).toFixed(2) }}</div>
        </div>

        <div v-if="debtPayments.length" class="settlement-history">
          <h3>Settlement History</h3>
          <div v-for="payment in debtPayments" :key="payment.id" class="settlement-row">
            <div>
              <strong>₱{{ fmt(payment.amount) }}</strong>
              <span class="settlement-meta">{{ formatPaymentMethod(payment.payment_method) }}</span>
            </div>
            <div class="settlement-meta">{{ new Date(payment.paid_at).toLocaleString() }}</div>
            <div class="settlement-meta">Balance after: ₱{{ fmt(payment.balance_after) }}</div>
            <div v-if="payment.note" class="settlement-note">{{ payment.note }}</div>
          </div>
        </div>

        <button v-if="canSettleSelectedSale" class="info btn-block-mobile" @click="settleDebtSale">Record Debt Payment</button>

        <button class="secondary btn-block-mobile" @click="closeModal">Close</button>
      </div>
    </div>

  </div>
</template>


<style scoped>
/* Reuse previous styles + voided status */
.page-shell { margin: auto; padding: 20px; overflow: visible; }

.sales-table-shell {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.sales-table-shell.table-wrap-menu-open {
  overflow: visible !important;
  z-index: 60;
}

.sales-table-shell.table-wrap-menu-open .col-menu {
  z-index: 700;
}

.sales-table-shell.table-wrap-menu-open thead .col-actions {
  z-index: 650;
}

.sales-table-shell.table-wrap-menu-open tbody .col-actions {
  z-index: 2;
}

.actions-td :deep(.icon-action-btn) { padding: 0; }

.status-pill,
.payment-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 92px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.status-pill-ok {
  background: rgba(26, 188, 156, 0.14);
  color: #0f8a72;
  border: 1px solid rgba(26, 188, 156, 0.24);
}

.status-pill-debt {
  background: rgba(180, 83, 9, 0.14);
  color: #b45309;
  border: 1px solid rgba(180, 83, 9, 0.22);
}

.status-pill-voided {
  background: rgba(231, 76, 60, 0.14);
  color: #cf3d30;
  border: 1px solid rgba(231, 76, 60, 0.24);
}

.payment-pill-cash {
  background: rgba(14, 165, 233, 0.12);
  color: #0369a1;
  border: 1px solid rgba(14, 165, 233, 0.22);
}

.payment-pill-gcash {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  border: 1px solid rgba(37, 99, 235, 0.22);
}

.payment-pill-maya {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
  border: 1px solid rgba(16, 185, 129, 0.22);
}

.payment-pill-card {
  background: rgba(139, 92, 246, 0.12);
  color: #6d28d9;
  border: 1px solid rgba(139, 92, 246, 0.22);
}

.payment-pill-bank {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.24);
}

.payment-pill-default {
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
  border: 1px solid rgba(100, 116, 139, 0.18);
}

.status-pill-dark.status-pill-ok {
  background: rgba(26, 188, 156, 0.2);
  color: #7ef7de;
  border-color: rgba(126, 247, 222, 0.34);
}

.status-pill-dark.status-pill-debt {
  background: rgba(180, 83, 9, 0.22);
  color: #fcd34d;
  border-color: rgba(252, 211, 77, 0.3);
}

.status-pill-dark.status-pill-voided {
  background: rgba(231, 76, 60, 0.22);
  color: #ff9d93;
  border-color: rgba(255, 157, 147, 0.34);
}

.payment-pill-dark.payment-pill-cash {
  background: rgba(14, 165, 233, 0.2);
  color: #93c5fd;
  border-color: rgba(147, 197, 253, 0.28);
}

.payment-pill-dark.payment-pill-gcash {
  background: rgba(37, 99, 235, 0.22);
  color: #bfdbfe;
  border-color: rgba(191, 219, 254, 0.3);
}

.payment-pill-dark.payment-pill-maya {
  background: rgba(16, 185, 129, 0.2);
  color: #a7f3d0;
  border-color: rgba(167, 243, 208, 0.28);
}

.payment-pill-dark.payment-pill-card {
  background: rgba(139, 92, 246, 0.22);
  color: #ddd6fe;
  border-color: rgba(221, 214, 254, 0.3);
}

.payment-pill-dark.payment-pill-bank {
  background: rgba(245, 158, 11, 0.2);
  color: #fde68a;
  border-color: rgba(253, 230, 138, 0.28);
}

.payment-pill-dark.payment-pill-default {
  background: rgba(148, 163, 184, 0.18);
  color: #e2e8f0;
  border-color: rgba(226, 232, 240, 0.24);
}

.settlement-history {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed #cbd5e1;
}

.settlement-history h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.settlement-row {
  padding: 10px 0;
  border-bottom: 1px solid #e2e8f0;
}

.settlement-meta {
  display: inline-block;
  margin-left: 8px;
  color: #64748b;
  font-size: 13px;
}

.settlement-note {
  margin-top: 4px;
  color: #475569;
  font-size: 13px;
}

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
