<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import SearchInput from '../components/SearchInput.vue'
import Pagination from '../components/Pagination.vue'
import ItemForm from '../components/ItemForm.vue'
import Swal from 'sweetalert2'

const store = useStore()
const route = useRoute()
const router = useRouter()

const showForm = ref(false)
const editingItem = ref(null)
const searchKeyword = ref('')
const filterMode = ref('active')
const currentPage = ref(1)
const itemsPerPage = ref(10)
const itemsPerPageOptions = [5, 10, 20, 50]
const sortBy = ref('')
const sortOrder = ref('asc')

const items = computed(() => store.state.items.items)
const stockMap = computed(() => store.state.items.stockMap)
const totalCount = computed(() => store.state.items.totalCount)
const totalPages = computed(() => Math.ceil(totalCount.value / itemsPerPage.value))

const loadPage = async () => {
  await store.dispatch('items/loadItemsPage', {
    page: currentPage.value,
    itemsPerPage: itemsPerPage.value,
    filter: filterMode.value,
    keyword: searchKeyword.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value
  })
}

onMounted(() => {
  const query = route.query
  const queryPage = Number(query.page || 0)
  const queryPerPage = Number(query.perPage || 0)

  if (queryPage > 0) currentPage.value = queryPage
  if (queryPerPage > 0) itemsPerPage.value = queryPerPage
  if (query.search !== undefined) searchKeyword.value = String(query.search)
  if (query.filter) filterMode.value = String(query.filter)
  if (query.sortBy) sortBy.value = String(query.sortBy)
  if (query.sortOrder) sortOrder.value = String(query.sortOrder)

  loadPage()
})

watch([currentPage, itemsPerPage, filterMode, sortBy, sortOrder], loadPage)
watch(searchKeyword, () => {
  currentPage.value = 1
  loadPage()
})

const addItem = () => {
  editingItem.value = null
  showForm.value = true
}

const editItem = (item) => {
  editingItem.value = item
  showForm.value = true
}

const viewItem = (item) => {
  router.push({
    name: 'ItemDetails',
    params: { id: item.id },
    query: {
      page: String(currentPage.value),
      search: searchKeyword.value || undefined,
      filter: filterMode.value,
      perPage: String(itemsPerPage.value),
      sortBy: sortBy.value || undefined,
      sortOrder: sortOrder.value,
    }
  })
}

const closeForm = async (saved = false) => {
  showForm.value = false
  editingItem.value = null

  if (saved) {
    await loadPage()
  }
}

const toggleSort = (field) => {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortOrder.value = 'asc'
  }

  currentPage.value = 1
}

const archiveItem = async (item) => {
  const ok = await Swal.fire({
    title: 'Archive this item?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes'
  })
  if (!ok.isConfirmed) return

  try {
    await store.dispatch('items/archiveItem', item)
    await loadPage()
    await Swal.fire({
      icon: 'success',
      title: 'Item archived',
      timer: 1200,
      showConfirmButton: false
    })
  } catch (err) {
    console.error('Failed to archive item', err)
    await Swal.fire({
      icon: 'error',
      title: 'Archive failed',
      text: err.message || 'Unable to archive this item.'
    })
  }
}

const restoreItem = async (item) => {
  const ok = await Swal.fire({
    title: 'Restore this item?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes'
  })
  if (!ok.isConfirmed) return

  try {
    await store.dispatch('items/restoreItem', item)
    await loadPage()
    await Swal.fire({
      icon: 'success',
      title: 'Item restored',
      timer: 1200,
      showConfirmButton: false
    })
  } catch (err) {
    console.error('Failed to restore item', err)
    await Swal.fire({
      icon: 'error',
      title: 'Restore failed',
      text: err.message || 'Unable to restore this item.'
    })
  }
}

const stockLabel = (item) => {
  if (!item.track_stock) return 'N/A'
  return stockMap.value[item.id] || 0
}

const inventoryModeLabel = (item) => {
  if (!item.track_stock) return 'No stock'
  if (item.track_batches && item.track_expiry) return 'Batch + expiry'
  if (item.track_batches) return 'Batch'
  return 'Stock only'
}
</script>

<template>
  <div class="page-shell items-page">
    <h1>Items</h1>

    <div class="top-bar">
      <SearchInput v-model="searchKeyword" placeholder="Search item..." />

      <select v-model="filterMode" class="select-field">
        <option value="active">Active</option>
        <option value="archived">Archived</option>
        <option value="all">All</option>
      </select>

      <button @click="addItem">Add Item</button>

      <div class="items-per-page">
        <label>Items:</label>
        <select v-model.number="itemsPerPage" class="select-field">
          <option v-for="opt in itemsPerPageOptions" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>
      </div>
    </div>

    <div class="phase-banner">
      The active catalog is now item-based. Legacy medicine records are migrated into items so the next business-specific flows can build on a single catalog.
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th @click="toggleSort('name')" style="cursor:pointer">
              Name
              <span v-if="sortBy === 'name'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span>
            </th>
            <th>Type</th>
            <th>Inventory Mode</th>
            <th>Regular Price</th>
            <th>Discount Price</th>
            <th @click="toggleSort('stock')" style="cursor:pointer">
              Stock
              <span v-if="sortBy === 'stock'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span>
            </th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>
              <div class="item-name">{{ item.name }}</div>
              <div v-if="item.description" class="item-description">{{ item.description }}</div>
            </td>
            <td class="caps">{{ item.item_type }}</td>
            <td>{{ inventoryModeLabel(item) }}</td>
            <td>PHP {{ item.price1 }}</td>
            <td>PHP {{ item.price2 || 0 }}</td>
            <td>{{ stockLabel(item) }}</td>
            <td class="col-actions actions-td">
              <button class="warning btn" @click="editItem(item)">Edit</button>
              <button class="info btn" @click="viewItem(item)">View</button>

              <button
                v-if="!item.is_archived"
                class="danger btn"
                @click="archiveItem(item)"
              >
                Archive
              </button>

              <button
                v-else
                class="restore btn"
                @click="restoreItem(item)"
              >
                Restore
              </button>
            </td>
          </tr>

          <tr v-if="!items.length">
            <td colspan="7" class="empty-state-cell">No items found.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination v-model:page="currentPage" :total-pages="totalPages" :max-pages="5" />

    <ItemForm
      v-if="showForm"
      :itemToEdit="editingItem"
      @close="closeForm"
      @saved="closeForm(true)"
    />
  </div>
</template>

<style scoped>
.items-page {
  margin: auto;
  padding: 20px;
  transition: background-color 0.3s, color 0.3s;
  overflow-x: hidden !important;
}

.phase-banner {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(26, 188, 156, 0.1);
  border: 1px solid rgba(26, 188, 156, 0.18);
  color: #0f766e;
}

.item-name {
  font-weight: 700;
}

.item-description {
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
}

.caps {
  text-transform: capitalize;
}

.actions-td button {
  margin-right: 6px !important;
  padding: 6px 10px !important;
}

@media (max-width: 768px) {
  .items-per-page > .select-field {
    flex: 1;
  }
}
</style>