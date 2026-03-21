<script setup>
import { ref, computed, onMounted, watch, toRaw } from 'vue'
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
const showEdit = ref(false)
const modalMode = ref('edit') // 'edit' or 'add'

/* ======================
   SALE DATA
====================== */
// const selectedSale = ref(null)

// const editSale = ref(null)
// const editItems = ref([])

const fmt = (v) => {
  const n = Number(v)
  return isNaN(n) ? '0.00' : n.toFixed(2)
}



// Compute change based on current total
const changeDue = computed(() => {
  const total = editGrandTotal.value || 0
  const given = Number(editSale.value?.money_given || 0)  // <- use editSale.money_given
  return Math.max(given - total, 0)
})
/* ======================
   CUSTOMER SEARCH
====================== */
const customerKeyword = ref('')
const customerResults = ref([])
const selectedCustomer = ref(null)

// Watch keyword and filter dynamically
watch(customerKeyword, (val) => {
  if (!val) {
    customerResults.value = []
    return
  }

  const keyword = val.toLowerCase()
  const allCustomers = store.state.customers.customers || []

  // filter only those whose name includes the keyword
  customerResults.value = allCustomers.filter(c =>
    c.name.toLowerCase().includes(keyword)
  )
})


// Select a customer from search results
const selectCustomer = (c) => {
  selectedCustomer.value = c
  if (editSale.value) editSale.value.customer_id = c.id
  customerResults.value = []
  customerKeyword.value = ''
}

// Clear selected customer
const clearCustomer = () => {
  selectedCustomer.value = null
  if (editSale.value) editSale.value.customer_id = null
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



const viewSale = async (sale) => {
  saleItems.value = await store.dispatch('sales/viewSale', sale.id)
  selectedSale.value = sale
  showView.value = true
}

/* ======================
   OPEN EDIT / ADD MODAL
====================== */
// const openEdit = async (sale) => {
//   modalMode.value = 'edit'

//   try {
//     // 1️⃣ Get sale items
//     const items = await store.dispatch('sales/viewSale', sale.id)
//     if (!items || !Array.isArray(items)) {
//       Swal.fire('Error', 'No sale items found', 'error')
//       return
//     }

//     // 2️⃣ Get all medicines to map their current prices
//     const allMedicines = store.state.medicines.medicines || []
//     const medsMap = Object.fromEntries(allMedicines.map(m => [m.id, m]))

//     // 3️⃣ Set editSale
//     editSale.value = { ...sale }

//     // 4️⃣ Map items with regular & discounted price tracking
//     editItems.value = items.map(i => {
//       const med = medsMap[i.medicine_id] || {}
//       const regular = Number(med.price1) ?? i.price_at_sale ?? 0
//       const discounted = Number(med.price2) ?? i.price_at_sale ?? 0

//       return {
//         id: i.id,
//         medicine_id: i.medicine_id,
//         medicine_name: i.medicine_name || med.name || 'Unknown',
//         generic_name: i.generic_name || med.generic_name || '',
//         qty: i.quantity ?? 1,

//         // price at time of sale
//         price: i.price_at_sale ?? regular,

//         // snapshot of medicine prices at that time
//         regular_price: regular,
//         discounted_price: discounted,

//         // detect which was used in the sale
//         price_mode: i.price_type ?? 'regular'
//       }
//     })

//     // 5️⃣ Set customer
//     selectedCustomer.value = customers.value.find(c => c.id === sale.customer_id) || null
//     customerKeyword.value = ''

//     // 6️⃣ Show modal
//     showEdit.value = true

//   } catch (err) {
//     console.error(err)
//     Swal.fire('Error', 'Failed to open edit modal: ' + err.message, 'error')
//   }
// }

// const openAddSale = () => {
//   modalMode.value = 'add'
//   editSale.value = {
//     customer_id: null,
//     purchased_date: '',
//     professional_fee: 0,
//     discount: 0
//   }
//   editItems.value = []
//   selectedCustomer.value = null
//   customerKeyword.value = ''
//   showEdit.value = true
// }

/* ======================
   MEDICINE SEARCH
====================== */
const medKeyword = ref('')
const medResults = ref([])

watch(medKeyword, (val) => {
  if (!val) {
    medResults.value = []
    return
  }

  const keyword = val.toLowerCase()
  medResults.value = allMedicines.value.filter(m =>
    m.name.toLowerCase().includes(keyword) || 
    (m.generic_name && m.generic_name.toLowerCase().includes(keyword))
  )
})


const addMedicine = (med) => {
  const existing = editItems.value.find(i => i.medicine_id === med.id)
  const regular = Number(med.price1) || 0
  const discount = Number(med.price2) || regular
  if (existing) existing.qty += 1
  else editItems.value.push({
    medicine_id: med.id,
    medicine_name: med.name,
    generic_name: med.generic_name,
    qty: 1,
    price: regular,
    regular_price: regular,
    discounted_price: discount,
    price_mode: 'regular'
  })
  medKeyword.value = ''
  medResults.value = []
}

const removeItem = (index) => editItems.value.splice(index, 1)

/* ======================
   PRICE MODE
====================== */
const setRegular = (item) => { item.price = Number(item.regular_price); item.price_mode = 'regular' }
const setDiscount = (item) => { item.price = Number(item.discounted_price); item.price_mode = 'discounted' }
const manualPrice = (item) => { item.price_mode = 'manual' }

/* ======================
   TOTALS
====================== */
const editSubTotal = computed(() =>
  editItems.value.reduce((sum, i) => sum + i.qty * i.price, 0)
)
const editGrandTotal = computed(() =>
  Math.max(editSubTotal.value + Number(editSale.value?.professional_fee || 0) - Number(editSale.value?.discount || 0), 0)
)

/* ======================
   SAVE SALE / EDIT
====================== */
// const saveModalSale = async () => {
//   if (!editItems.value.length) {
//     Swal.fire('Error', 'No items in the sale', 'error')
//     return
//   }

//   // Use money from editSale.money_given
//   const money = parseFloat(editSale.value?.money_given)
//   if (isNaN(money)) {
//     Swal.fire('Error', 'Invalid amount for Money Given', 'error')
//     return
//   }

//   const total = parseFloat(editGrandTotal.value.toFixed(2))

//   if (money < total) {
//     Swal.fire(
//       'Error',
//       `Money given (₱${money.toFixed(2)}) is less than total (₱${total.toFixed(2)})`,
//       'error'
//     )
//     return
//   }

//   const change = money - total

//   const confirm = await Swal.fire({
//     title: modalMode.value === 'edit' ? 'Save changes?' : 'Save this sale?',
//     icon: 'question',
//     showCancelButton: true,
//     confirmButtonText: 'Save'
//   })
//   if (!confirm.isConfirmed) return

//   const saleData = structuredClone(toRaw(editSale.value))
//   const itemsData = structuredClone(editItems.value.map(i => toRaw(i)))

//   try {
//     if (modalMode.value === 'edit') {
//       await store.dispatch('sales/saveEdit', {
//         sale: { 
//           ...saleData,
//           total_amount: editSubTotal.value,
//           final_total: editGrandTotal.value,
//           money_given: money,
//           change: change
//         },
//         items: itemsData
//       })
//       Swal.fire({ icon: 'success', title: 'Sale updated', timer: 1200, showConfirmButton: false })
//     } else {
//       await store.dispatch('sales/saveSale', {
//         cart: itemsData.map(i => ({ ...i })),
//         customer_id: editSale.value.customer_id,
//         subTotal: editSubTotal.value,
//         professionalFee: Number(editSale.value.professional_fee || 0),
//         discount: Number(editSale.value.discount || 0),
//         finalTotal: editGrandTotal.value,
//         purchased_date: editSale.value.purchased_date || null,
//         money_given: money,
//         change: change
//       })
//       Swal.fire({ icon: 'success', title: 'Sale added', timer: 1200, showConfirmButton: false })
//     }

//     showEdit.value = false
//     store.dispatch('sales/loadSales')
//   } catch (err) {
//     console.error(err)
//     Swal.fire('Error', err.message || 'Failed to save sale', 'error')
//   }
// }


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

console.log(sales)


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
            <!-- <button v-if="sale.status === 'completed'" @click="openEdit(sale)">Edit</button> -->
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

    <!-- EDIT / ADD SALE MODAL -->
    <div v-if="showEdit" class="modal-backdrop">
      <div class="modal modal-wide">
        <h2>{{ modalMode === 'edit' ? `Edit Sale #${editSale.id}` : 'Add New Sale' }}</h2>

        <!-- CUSTOMER SEARCH -->
        <div class="customer-search" style="position: relative; max-width: 300px; margin-bottom: 10px;">
          <SearchInput v-model="customerKeyword" placeholder="Search customer..." wrapperClass="full" :inputClass="'input'" />

          <!-- SEARCH RESULTS DROPDOWN -->
          <div v-if="customerResults.length"
              class="search-results"
              style="position: absolute; top: 36px; left: 0; right: 0; max-height: 150px; overflow-y: auto; background: white; border: 1px solid #ccc; z-index: 10;">
            <div v-for="c in customerResults" 
                :key="c.id" 
                class="search-item" 
                @click="selectCustomer(c)"
                style="padding: 6px; cursor: pointer;">
              {{ c.name }}
            </div>
          </div>

          <!-- SELECTED CUSTOMER DISPLAY -->
          <div v-if="selectedCustomer"
              style="margin-top: 4px; display: flex; align-items: center; gap: 6px; font-size: 14px;">
            Selected: <strong>{{ selectedCustomer.name }}</strong>
            <button @click="clearCustomer" style="padding: 2px 6px; font-size: 12px;">✕</button>
          </div>
        </div>


<!-- MEDICINE SEARCH -->
<div class="add-medicine" style="position: relative; max-width: 300px; margin-bottom: 10px;">
  <input
    type="text"
    placeholder="Search medicine..."
    v-model="medKeyword"
    style="width: 100%; box-sizing: border-box; padding: 6px; text-align: left;"
  />

  <!-- SEARCH RESULTS DROPDOWN -->
  <div v-if="medResults.length"
       class="search-results"
       style="position: absolute; top: 36px; left: 0; right: 0; max-height: 150px; overflow-y: auto; background: white; border: 1px solid #ccc; z-index: 10;">
    <div v-for="med in medResults"
         :key="med.id"
         class="search-item"
         @click="addMedicine(med)"
         style="padding: 6px; cursor: pointer;">
      <strong>{{ med.name }}</strong>
      <div class="generic">{{ med.generic_name }}</div>
    </div>
  </div>
</div>



        <!-- ITEMS TABLE -->
        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th width="60">Qty</th>
              <th width="220">Price</th>
              <th width="120">Subtotal</th>
              <th width="40"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in editItems" :key="index">
              <td>
                <div>{{ item.medicine_name }}</div>
                <div class="generic">{{ item.generic_name }}</div>
              </td>
              <td><input type="number" min="1" v-model.number="item.qty" style="width:60px;text-align:center;" /></td>
              <td>
                <div class="price-buttons">
                  <button 
                    class="reg"
                    :class="{ active: item.price_mode==='regular' }"
                    @click="setRegular(item)">
                    REG ₱{{ item.regular_price.toFixed(2) }}
                  </button>

                  <button 
                    class="disc"
                    :class="{ active: item.price_mode==='discounted' }"
                    @click="setDiscount(item)">
                    DISC ₱{{ item.discounted_price.toFixed(2) }}
                  </button>
                </div>
                <input type="number" step="0.01" v-model.number="item.price" @input="manualPrice(item)" />
              </td>
              <td>₱{{ (item.qty * item.price).toFixed(2) }}</td>
              <td><button class="danger" @click="removeItem(index)">✕</button></td>
            </tr>
          </tbody>
        </table>

        <!-- FEES -->
        <div class="edit-totals">
          <label>Prof Fee <input type="number" v-model.number="editSale.professional_fee" /></label>
          <label>Discount <input type="number" v-model.number="editSale.discount" /></label>
        </div>

        <!-- PAYMENT -->
        <div class="payment-section" style="margin-top: 12px; display: flex; gap: 12px; align-items: center;">
          <label>
            Money Given
            <input type="number" min="0" v-model.number="editSale.money_given" style="width: 120px; text-align:right;" />
          </label>

          <label>
            Change
            <input type="number" :value="changeDue.toFixed(2)" disabled style="width: 120px; text-align:right; background:#f5f5f5;" />
          </label>
        </div>



        <h3>Total: ₱{{ editGrandTotal.toFixed(2) }}</h3>

        <!-- ACTIONS -->
        <div class="modal-actions">
          <button @click="saveModalSale">{{ modalMode==='edit' ? 'Save Changes' : 'Save Sale' }}</button>
          <button class="danger" @click="showEdit=false">Cancel</button>
        </div>
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

.modal-wide {
  max-width: 900px;
}

.add-medicine {
  margin-bottom: 12px;
  position: relative;
}

.search-results {
  position: absolute;
  z-index: 10;
  background: #fff;
  border: 1px solid #ccc;
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
  border-radius: 8px;
}

body.dark-mode .search-results {
  background: #1e1e1e;
  border-color: #333;
}

.search-item {
  padding: 10px;
  cursor: pointer;
}

.search-item:hover {
  background: #f0f0f0;
}

body.dark-mode .search-item:hover {
  background: #2a2a2a;
}

.price-buttons {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.price-buttons button {
  padding: 4px 8px;
  font-size: 13px;
}

.price-buttons button.active {
  background: #1abc9c;
}

.edit-totals {
  display: flex;
  gap: 12px;
  margin: 12px 0;
}
.price-btn {
  padding: 6px 10px;
  border-radius: 6px;
  border: 2px solid transparent; /* 👈 default */
  color: #fff;
  cursor: pointer;
  opacity: 0.6;
  transition: border-color 0.15s ease, opacity 0.15s ease;
}

/* ACTIVE STATE → BORDER ONLY */
.price-btn.active {
  opacity: 1;
  font-weight: 600;
  border-color: #000; /* default for light mode */
}

/* REGULAR */
.price-btn.reg {
  background-color: #1abc9c;
}

/* DISCOUNT */
.price-btn.disc {
  background-color: #3498db;
}

/* DARK MODE BORDER */
body.dark-mode .price-btn.active {
  border-color: #fff;
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

.customer-search {
  position: relative;
  margin-bottom: 10px;
}
.customer-search input {
  width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #ccc;
}

.qty-input {
  width: 60px; /* smaller width */
  text-align: center;
}

.price-buttons {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}

.price-buttons button {
  flex: 1;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #ccc;
  background: #f3f3f3;
  cursor: pointer;
  transition: all 0.15s ease;
}

/* REGULAR */
.price-buttons button.reg {
  border-color: #3498db;
  color: #3498db;
}

/* DISCOUNT */
.price-buttons button.disc {
  border-color: #27ae60;
  color: #27ae60;
}

/* HOVER */
.price-buttons button:hover {
  background: #eaeaea;
}

/* ACTIVE STATE */
.price-buttons button.active {
  color: #fff;
  font-weight: bold;
}

.price-buttons button.reg.active {
  background: #3498db;
  border-color: #3498db;
}

.price-buttons button.disc.active {
  background: #27ae60;
  border-color: #27ae60;
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
