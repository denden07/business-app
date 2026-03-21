<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import SearchInput from '../components/SearchInput.vue'
import { useStore } from 'vuex'
import MedicineForm from '../components/MedicineForm.vue'
import MedicineViewModal from '../components/MedicineViewModal.vue'
import Pagination from '../components/Pagination.vue'
import Swal from 'sweetalert2'

const store = useStore()

// UI state
const showForm = ref(false)
const editingMedicine = ref(null)
const showView = ref(false)
const selectedMedicine = ref(null)

// Search & filter
const searchKeyword = ref('')
const filterMode = ref('active')

// Pagination
const currentPage = ref(1)
const itemsPerPage = ref(10)
const itemsPerPageOptions = [5, 10, 20, 50]

// Sorting
const sortBy = ref('') // '', 'name', 'stock'
const sortOrder = ref('asc') // 'asc' | 'desc'

// Vuex state
const medicines = computed(() => store.state.medicines.medicines)
const stockMap = computed(() => store.state.medicines.stockMap)
const loading = computed(() => store.state.medicines.loading)
const totalCount = computed(() => store.state.medicines.totalCount)
const totalPages = computed(() =>
  Math.ceil(totalCount.value / itemsPerPage.value)
)

// 🔁 Load page
const loadPage = () => {
  store.dispatch('medicines/loadMedicinesPage', {
    page: currentPage.value,
    itemsPerPage: itemsPerPage.value,
    filter: filterMode.value,
    keyword: searchKeyword.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value
  })
}

onMounted(loadPage)

// 🔄 React to changes
watch([currentPage, itemsPerPage, filterMode, sortBy, sortOrder], loadPage)
watch(searchKeyword, () => {
  currentPage.value = 1
  loadPage()
})

// Modals
const addMedicine = () => {
  editingMedicine.value = null
  showForm.value = true
}

const editMedicine = med => {
  editingMedicine.value = med
  showForm.value = true
}

const viewMedicine = med => {
  selectedMedicine.value = med
  showView.value = true
}

const closeForm = async (saved = false) => {
  showForm.value = false
  editingMedicine.value = null
  if (saved) {
    await loadPage()
    Swal.fire({
      icon: 'success',
      title: 'Saved!',
      timer: 1200,
      showConfirmButton: false
    })
  }
}

// Pagination buttons
const goPage = p => {
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
}

const pageNumbers = computed(() =>
  Array.from({ length: totalPages.value }, (_, i) => i + 1)
)

// Toggle sort helper
const toggleSort = field => {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortOrder.value = 'asc'
  }
  currentPage.value = 1
}

// Archive / Restore
const archiveMedicine = async med => {
  const ok = await Swal.fire({
    title: 'Archive this medicine?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes'
  })
  if (!ok.isConfirmed) return

  await store.dispatch('medicines/archiveMedicine', med)
  await loadPage()
}

const restoreMedicine = async med => {
  const ok = await Swal.fire({
    title: 'Restore this medicine?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes'
  })
  if (!ok.isConfirmed) return

  await store.dispatch('medicines/restoreMedicine', med)
  await loadPage()
}
</script>


<template>
  <div class="medicines-page">
    <h1>Medicines</h1>

    <div class="top-bar">
      <SearchInput v-model="searchKeyword" placeholder="Search medicine..." />

      <!-- FILTER -->
      <select v-model="filterMode">
        <option value="active">Active</option>
        <option value="archived">Archived</option>
        <option value="all">All</option>
      </select>

      <button @click="addMedicine">Add Medicine</button>

      <div class="items-per-page">
        <label>Items:</label>
        <select v-model.number="itemsPerPage">
          <option v-for="opt in itemsPerPageOptions" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th @click="toggleSort('name')" style="cursor:pointer">
            Brand
            <span v-if="sortBy === 'name'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span>
          </th>
          <th>Generic</th>
          <th>Regular price</th>
          <th>Discount price</th>
          <th @click="toggleSort('stock')" style="cursor:pointer">
            Stock
            <span v-if="sortBy === 'stock'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span>
          </th>
          <th>Actions</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="med in medicines" :key="med.id">
          <td>{{ med.name }}</td>
          <td>{{ med.generic_name || '—' }}</td>
          <td>₱{{ med.price1 }}</td>
          <td>₱{{ med.price2 }}</td>
          <td>{{ stockMap[med.id] || 0 }}</td>
          <td class="actions-td">
            <button @click="editMedicine(med)">Edit</button>
            <button @click="viewMedicine(med)">View</button>

            <button
              v-if="!med.is_archived"
              class="danger"
              @click="archiveMedicine(med)"
            >
              Archive
            </button>

            <button
              v-else
              class="restore"
              @click="restoreMedicine(med)"
            >
              Restore
            </button>
          </td>
        </tr>
      </tbody>

    </table>

    <!-- Pagination -->
    <Pagination v-model:page="currentPage" :total-pages="totalPages" :max-pages="5" />

    <!-- Modals -->
    <MedicineForm
      v-if="showForm"
      :medicineToEdit="editingMedicine"
      @close="closeForm"
      @saved="closeForm(true)"
    />

    <MedicineViewModal
      v-if="showView"
      :medicine="selectedMedicine"
      :show="showView"
      @close="showView = false"
    />
  </div>
</template>


<style scoped>
.medicines-page {
  margin: auto;
  padding: 20px;
  transition: background-color 0.3s, color 0.3s;
  overflow-x: hidden !important;
}

/* Dark mode support */
body.dark-mode .medicines-page {
  background-color: #121212 !important;
  color: #eee !important;
}

/* ===========================
   TOP BAR
=========================== */
.top-bar {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 10px !important;
  align-items: center !important;
  margin-bottom: 12px !important;
}

/* INPUT */
.top-bar input {
  appearance: none !important;
  -webkit-appearance: none !important;
  flex: 1 !important;
  min-width: 150px !important;
  min-height: 40px !important;
  padding: 8px 12px !important;
  border-radius: 8px !important;
  border: 1px solid #ccc !important;
  background-color: #fff !important;
  color: #222 !important;
  font-size: 16px !important;
}

body.dark-mode .top-bar input {
  background-color: #1c1c1c !important;
  border-color: #333 !important;
  color: #eee !important;
}

.top-bar input:focus {
  border-color: #1abc9c !important;
}

/* SELECT */
.top-bar select {
  min-height: 40px !important;
  padding: 8px 12px !important;
  border-radius: 8px !important;
  border: 1px solid #ccc !important;
  background-color: #fff !important;
  color: #222 !important;
  font-size: 16px !important;
}

body.dark-mode .top-bar select {
  background-color: #1c1c1c !important;
  border-color: #333 !important;
  color: #eee !important;
}

.items-per-page {
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
}

/* ===========================
   BUTTONS
=========================== */
button {
  appearance: none !important;
  -webkit-appearance: none !important;
  min-height: 40px !important;
  padding: 8px 14px !important;
  border-radius: 8px !important;
  border: none !important;
  font-size: 15px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  background-color: #1abc9c !important;
  color: #fff !important;
}

button:active {
  transform: scale(0.97);
}

body.dark-mode button {
  background-color: #16a085 !important;
}

/* ===========================
   TABLE (ANDROID SAFE)
=========================== */
table {
  width: 100% !important;
  margin-top: 10px !important;
  border-collapse: collapse !important;
  overflow-x: auto !important;
  white-space: nowrap !important;
  -webkit-overflow-scrolling: touch !important;
}

th, td {
  border: 1px solid #ccc !important;
  padding: 8px !important;
  text-align: left !important;
}

body.dark-mode table,
body.dark-mode th,
body.dark-mode td {
  border-color: #333 !important;
}

/* ===========================
   ACTION BUTTONS
=========================== */
.actions-td button {
  margin-right: 6px !important;
  padding: 6px 10px !important;
}

body.dark-mode .actions-td button {
  background-color: #222 !important;
  color: #eee !important;
}

body.dark-mode .actions-td button:hover {
  background-color: #333 !important;
}

/* ===========================
   PAGINATION
=========================== */
.pagination {
  margin-top: 12px !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  gap: 6px !important;
  flex-wrap: wrap !important;
}

.pagination button.active {
  background-color: #1abc9c !important;
  color: #fff !important;
  border-radius: 6px !important;
  padding: 6px 12px !important;
}

body.dark-mode .pagination button.active {
  background-color: #16a085 !important;
}

/* ===========================
   MOBILE FIXES
=========================== */
@media (max-width: 768px) {
  .top-bar {
    flex-direction: column !important;
    align-items: stretch !important;
  }

  .top-bar button {
    width: 100% !important;
  }

  .pagination {
    gap: 4px !important;
  }
}

.actions-td .danger {
  background-color: #e74c3c !important;
}
body.dark-mode .actions-td .danger {
  background-color: #c0392b !important;
}

.actions-td .danger {
  background-color: #e74c3c !important;
}
body.dark-mode .actions-td .danger {
  background-color: #c0392b !important;
}


.actions-td .default {
  background-color: #3498db !important;
}
body.dark-mode .actions-td .default {
  background-color: #3498db !important;
}

.actions-td .restore {
  background-color: #3498db !important;
}


</style>
