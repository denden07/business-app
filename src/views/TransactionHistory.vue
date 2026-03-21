<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SearchInput from '../components/SearchInput.vue'
import Pagination from '../components/Pagination.vue'
import { useStore } from 'vuex'
import { dbPromise } from '../db'

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
const filterType = ref('all')
const sortOrder = ref('desc')
const currentPage = ref(1)
const itemsPerPage = ref(10)
const itemsPerPageOptions = [5, 10, 20, 50]

const showSaleModal = ref(false)
const selectedSale = ref(null)

/* ======================
   WATCHERS
====================== */
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
      <button class="secondary back-btn" @click="goBack">← Back to Customers</button>
    </div>

    <!-- TABS -->
    <div class="tabs">
      <button
        :class="{ active: activeTab === 'points' }"
        @click="activeTab = 'points'"
      >
        Points History
      </button>

      <button
        :class="{ active: activeTab === 'purchases' }"
        @click="activeTab = 'purchases'"
      >
        Purchase History
      </button>
    </div>

    <!-- TOP BAR -->
    <div class="top-bar">
      <label style="display:flex;align-items:center;gap:8px">
        From
        <input type="date" v-model="startDate" />
      </label>

      <label style="display:flex;align-items:center;gap:8px">
        To
        <input type="date" v-model="endDate" />
      </label>

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
      <button class="danger" @click="startDate=''; endDate=''; filterType='all'">Clear</button>
    </div>

    <!-- POINTS HISTORY -->
    <table v-if="activeTab === 'points'">
      <thead>
        <tr>
          <th>Date</th>
          <th>Points</th>
          <th>Type</th>
          <th>Notes</th>
          <th>Sale #</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in paginatedData" :key="p.id">
          <td>{{ new Date(p.date).toLocaleString() }}</td>
          <td :class="p.points > 0 ? 'points-plus' : 'points-minus'">
            {{ p.points > 0 ? '+' : '' }}{{ p.points }}
          </td>
          <td>{{ p.type }}</td>
          <td>{{ p.description || '-' }}</td>
          <td>
            <span
              v-if="p.related_sale_id"
              class="sale-link"
              @click="openSaleModal(sales.find(s => s.id === p.related_sale_id))"
            >
              #{{ p.related_sale_id }}
            </span>
            <span v-else>—</span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- PURCHASE HISTORY -->
    <table v-if="activeTab === 'purchases'">
      <thead>
        <tr>
          <th>Date</th>
          <th>Sale #</th>
          <th>Total</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="s in paginatedData"
          :key="s.id"
          @click="openSaleModal(s)"
          style="cursor:pointer"
        >
          <td>{{ new Date(s.created_at).toLocaleString() }}</td>
          <td>#{{ s.id }}</td>
          <td>₱{{ (s.final_total || 0).toFixed(2) }}</td>
          <td>
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
      </tbody>
    </table>

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

        <button @click="showSaleModal = false">Close</button>
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

.tabs button {
  padding: 8px 14px;
  border-radius: 8px;
  border: none;
  background: #ddd;
  cursor: pointer;
  font-weight: 600;
}

.tabs button.active {
  background: #1abc9c;
  color: #fff;
}

body.dark-mode .tabs button {
  background: #333;
  color: #eee;
}

body.dark-mode .tabs button.active {
  background: #16a085;
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
   TABLE
====================== */
table {
  width: 100%;
  border-collapse: collapse;
  white-space: nowrap;
  background: #fff;
}

body.dark-mode table {
  background: #181818;
}

th,
td {
  border: 1px solid #ccc;
  padding: 8px;
  text-align: left;
}

body.dark-mode th,
body.dark-mode td {
  border-color: #333;
}

tbody tr:hover {
  background: #f5f5f5;
}

body.dark-mode tbody tr:hover {
  background: #222;
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
   PAGINATION
====================== */
.pagination {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  gap: 6px;
}

.pagination button {
  min-height: 36px;
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: #1abc9c;
  color: #fff;
  cursor: pointer;
}

.pagination button.active {
  background: #16a085;
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

/* modal button */
.modal button {
  margin-top: 14px;
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: #1abc9c;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.modal button:hover {
  background: #16a085;
}

.back-btn {
  background: #3498db;
  color: #fff;
  padding: 6px 14px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.back-btn:hover {
  background: #2980b9;
}

body.dark-mode .back-btn {
  background: #2980b9;
}

/* Danger button (red) */
.danger {
  background-color: #e74c3c;
  color: #fff;
}

.danger:hover {
  background-color: #c0392b;
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


</style>