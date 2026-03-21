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

/* ======================
   COLUMN VISIBILITY
====================== */
const _medsDefaultCols = { name: true, generic_name: true, price1: true, price2: true, stock: true }
const colMenuOpen = ref(false)
const visibleCols = ref({ ..._medsDefaultCols, ...JSON.parse(localStorage.getItem('col-vis-medicines') || '{}') })
watch(visibleCols, v => localStorage.setItem('col-vis-medicines', JSON.stringify(v)), { deep: true })
const allCols = [
  { key: 'name', label: 'Brand' },
  { key: 'generic_name', label: 'Generic' },
  { key: 'price1', label: 'Regular Price' },
  { key: 'price2', label: 'Discount Price' },
  { key: 'stock', label: 'Stock' },
]
const toggleCol = (key) => { visibleCols.value[key] = !visibleCols.value[key] }

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

    <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th v-if="visibleCols.name" @click="toggleSort('name')" style="cursor:pointer">
            Brand
            <span v-if="sortBy === 'name'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span>
          </th>
          <th v-if="visibleCols.generic_name">Generic</th>
          <th v-if="visibleCols.price1">Regular price</th>
          <th v-if="visibleCols.price2">Discount price</th>
          <th v-if="visibleCols.stock" @click="toggleSort('stock')" style="cursor:pointer">
            Stock
            <span v-if="sortBy === 'stock'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span>
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
        <tr v-for="med in medicines" :key="med.id">
          <td v-if="visibleCols.name">{{ med.name }}</td>
          <td v-if="visibleCols.generic_name">{{ med.generic_name || '—' }}</td>
          <td v-if="visibleCols.price1">₱{{ med.price1 }}</td>
          <td v-if="visibleCols.price2">₱{{ med.price2 }}</td>
          <td v-if="visibleCols.stock">{{ stockMap[med.id] || 0 }}</td>
          <td class="col-actions actions-td">
            <button class="warning btn" @click="editMedicine(med)">Edit</button>
            <button class="info btn" @click="viewMedicine(med)">View</button>

            <button
              v-if="!med.is_archived"
              class="danger btn"
              @click="archiveMedicine(med)"
            >
              Archive
            </button>

            <button
              v-else
              class="restore btn"
              @click="restoreMedicine(med)"
            >
              Restore
            </button>
          </td>
        </tr>
      </tbody>

    </table>
    </div>

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

.items-per-page {
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
}

/* ===========================
   ACTION BUTTONS
=========================== */
.actions-td button {
  margin-right: 6px !important;
  padding: 6px 10px !important;
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

  .top-bar > button {
    width: 100% !important;
  }

  .pagination {
    gap: 4px !important;
  }
}

</style>
