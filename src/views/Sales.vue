<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import SearchInput from '../components/SearchInput.vue'
import Swal from 'sweetalert2'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { downloadCSV } from '../utils/exportCsv'
import Pagination from '../components/Pagination.vue'



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
   FILTERS & PAGINATION
====================== */
const searchKeyword = ref('')
const startDate = ref('')
const endDate = ref('')

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

      <label>
        From
        <input type="date" v-model="startDate" />
      </label>

      <label>
        To
        <input type="date" v-model="endDate" />
      </label>

      <select v-model.number="itemsPerPage">
        <option v-for="o in itemsPerPageOptions" :key="o" :value="o">{{ o }}</option>
      </select>

      <button @click="goToHome">Add Sale</button>

      <!-- EXPORT -->
      <button @click="exportCSV" class="secondary">
        Export CSV
      </button>
    </div>



    <!-- TABLE -->
    <table>
      <thead>
        <tr>
          <th>Sale #</th>
          <th>Purchased Date</th>
          <th>Subtotal</th>
          <th>Discount</th>
          <th>Prof Fee</th>
          <th>Total</th>
          <th @click="toggleSort('payment_method')" style="cursor: pointer; user-select: none;">
            Payment {{ sortBy === 'payment_method' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
          </th>
          <th @click="toggleSort('status')" style="cursor: pointer; user-select: none;">
            Status {{ sortBy === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
          </th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="sale in sales" :key="sale.id">
          <td>#{{ sale.id }}</td>
          <td>{{ new Date(sale.purchased_date).toLocaleString() }}</td>
          <td>₱{{ fmt(sale.total_amount) }}</td>
          <td>₱{{ fmt(sale.discount) }}</td>
          <td>₱{{ fmt(sale.professional_fee) }}</td>
          <td><strong>₱{{ fmt(sale.final_total) }}</strong></td>
          <td>{{ sale.payment_method || 'Cash' }}</td>
          <td :class="sale.status === 'voided' ? 'status-voided' : 'status-ok'">{{ sale.status }}</td>
          <td style="display: flex;gap:8px">
            <button @click="openSaleModal(sale)">View</button>
            <button v-if="sale.status === 'completed'" class="danger" @click="voidSale(sale)">Void</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- PAGINATION -->
    <Pagination v-model:page="currentPage" :total-pages="totalPages" :max-pages="5" />

    <!-- VIEW SALE MODAL -->
    <div v-if="showView" class="modal-backdrop">
      <div class="modal">
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
          </tbody>
        </table>
        <div class="sale-summary">
          <div>Subtotal: ₱{{ selectedSale.total_amount.toFixed(2) }}</div>
          <div>Professional Fee: ₱{{ selectedSale.professional_fee.toFixed(2) }}</div>
          <div>Discount: ₱{{ selectedSale.discount.toFixed(2) }}</div>
          <div><strong>Total: ₱{{ selectedSale.final_total.toFixed(2) }}</strong></div>

          <hr />

          <div>Money Given: ₱{{ (selectedSale.money_given || 0).toFixed(2) }}</div>
          <div>Change: ₱{{ (selectedSale.change || 0).toFixed(2) }}</div>
        </div>

        <button @click="closeModal">Close</button>
      </div>
    </div>

  </div>
</template>


<style scoped>
/* Reuse previous styles + voided status */
.medicines-page { margin: auto; padding: 20px; overflow-x: hidden; }
body.dark-mode .medicines-page { background-color: #121212; color: #eee; }

.top-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
.top-bar input, .top-bar select { min-height: 40px; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; background: #fff; color: #222; font-size: 16px; }
body.dark-mode .top-bar input, body.dark-mode .top-bar select { background-color: #1c1c1c; border-color: #333; color: #eee; }

.items-per-page { display: flex; align-items: center; gap: 4px; }

table { width: 100%; border-collapse: collapse; white-space: nowrap; }
th, td { border: 1px solid #ccc; padding: 8px; }
body.dark-mode table, body.dark-mode th, body.dark-mode td { border-color: #333; }

button { min-height: 40px; padding: 8px 14px; border-radius: 8px; border: none; background-color: #1abc9c; color: #fff; cursor: pointer; }
body.dark-mode button { background-color: #16a085; }

.actions-td button { padding: 6px 10px; }
.danger { background-color: #e74c3c; }

.pagination { margin-top: 12px; display: flex; justify-content: center; gap: 6px; }
.pagination button.active { background-color: #1abc9c; }

.modal-backdrop { overflow-y:auto; position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.modal { background: #fff; padding: 20px; border-radius: 10px; width: 90%; max-width: 600px; }
body.dark-mode .modal { background: #1e1e1e; color: #eee; }
.close-btn { margin-top: 12px; width: 100%; }

.status-ok { color: #1abc9c; font-weight: 600; }
.status-voided { color: #e74c3c; font-weight: 700; }

.med-name { font-weight: 600; }
.med-generic { font-size: 13px; color: #666; }
body.dark-mode .med-generic { color: #aaa; }

@media (max-width: 768px) {
  .top-bar { flex-direction: column; }
  button { width: 100%; }
}

/* Modal input styling */
.modal input[type="number"],
.modal input[type="date"],
.modal input[type="text"] {
  min-height: 36px;
  padding: 6px 10px;
  margin: 4px 0;
  border-radius: 6px;
  border: 1px solid #ccc;
  font-size: 14px;
  background-color: #fff;
  color: #222;
}

body.dark-mode .modal input[type="number"],
body.dark-mode .modal input[type="date"],
body.dark-mode .modal input[type="text"] {
  background-color: #1e1e1e;
  border-color: #333;
  color: #eee;
}

.sale-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.sale-meta {
  font-size: 13px;
  color: #666;
}

body.dark-mode .sale-meta {
  color: #aaa;
}

.badge {
  padding: 6px 10px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 12px;
}

.badge-ok {
  background: #1abc9c;
  color: white;
}

.badge-voided {
  background: #e74c3c;
  color: white;
}

.sale-summary hr {
  margin: 8px 0;
  border: none;
  border-top: 1px dashed #ccc;
}



</style>
