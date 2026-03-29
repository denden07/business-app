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
const expiryFilter = ref('all')
const currentPage = ref(1)
const itemsPerPage = ref(10)
const itemsPerPageOptions = [5, 10, 20, 50]
const sortBy = ref('')
const sortOrder = ref('asc')
const colMenuOpen = ref(false)
const columnVisibilityStorageKey = 'col-vis-items'
const columnVisibilityVersionKey = 'col-vis-items-version'
const columnVisibilityVersion = '2'

const storedVisibleCols = JSON.parse(localStorage.getItem(columnVisibilityStorageKey) || '{}')
const storedColumnVisibilityVersion = localStorage.getItem(columnVisibilityVersionKey)

if (storedColumnVisibilityVersion !== columnVisibilityVersion) {
  storedVisibleCols.inventory_mode = false
}

const defaultVisibleCols = {
  name: true,
  type: true,
  inventory_mode: false,
  regular_price: true,
  discount_price: true,
  stock: true,
  expiry_alert: true,
}

const visibleCols = ref({
  ...defaultVisibleCols,
  ...storedVisibleCols,
})

const allCols = [
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'inventory_mode', label: 'Inventory Mode' },
  { key: 'regular_price', label: 'Regular Price' },
  { key: 'discount_price', label: 'Discount Price' },
  { key: 'stock', label: 'Stock' },
  { key: 'expiry_alert', label: 'Expiry Alert' },
]

const items = computed(() => store.state.items.items)
const stockMap = computed(() => store.state.items.stockMap)
const expiryAlertMap = computed(() => store.state.items.expiryAlertMap || {})
const totalCount = computed(() => store.state.items.totalCount)
const totalPages = computed(() => Math.ceil(totalCount.value / itemsPerPage.value))
const visibleColumnCount = computed(() => allCols.filter(col => visibleCols.value[col.key]).length + 1)

const expiryCounts = computed(() => {
  return items.value.reduce((counts, item) => {
    const summary = expiryAlertMap.value[item.id]
    if (!summary?.tracked) {
      return counts
    }

    if (summary.status === 'expired') counts.expired += 1
    else if (summary.status === 'critical') counts.critical += 1
    else if (summary.status === 'warning') counts.warning += 1

    return counts
  }, { expired: 0, critical: 0, warning: 0 })
})

const loadPage = async () => {
  await store.dispatch('items/loadItemsPage', {
    page: currentPage.value,
    itemsPerPage: itemsPerPage.value,
    filter: filterMode.value,
    expiryFilter: expiryFilter.value,
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
  if (query.expiry) expiryFilter.value = String(query.expiry)
  if (query.sortBy) sortBy.value = String(query.sortBy)
  if (query.sortOrder) sortOrder.value = String(query.sortOrder)

  loadPage()
})

watch([currentPage, itemsPerPage, filterMode, expiryFilter, sortBy, sortOrder], loadPage)
watch(searchKeyword, () => {
  currentPage.value = 1
  loadPage()
})
watch(visibleCols, value => {
  localStorage.setItem(columnVisibilityStorageKey, JSON.stringify(value))
  localStorage.setItem(columnVisibilityVersionKey, columnVisibilityVersion)
}, { deep: true })

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
      expiry: expiryFilter.value !== 'all' ? expiryFilter.value : undefined,
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

const toggleCol = (key) => {
  visibleCols.value[key] = !visibleCols.value[key]
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
  if (!item.track_stock) {
    return { primary: 'N/A', secondary: '' }
  }

  const rawStock = Number(stockMap.value[item.id] || 0)
  const sellableStock = Number(expiryAlertMap.value[item.id]?.sellableQuantity ?? rawStock)

  if (sellableStock !== rawStock) {
    return {
      primary: rawStock,
      secondary: `${sellableStock} sellable`,
    }
  }

  return {
    primary: rawStock,
    secondary: '',
  }
}

const inventoryModeLabel = (item) => {
  if (!item.track_stock) return 'No stock'
  if (item.track_batches && item.track_expiry) return 'Batch + expiry'
  if (item.track_batches) return 'Batch'
  return 'Stock only'
}

const expirySummaryLabel = (item) => {
  const summary = expiryAlertMap.value[item.id]

  if (!item.track_expiry) return 'Not tracked'
  if (!summary) return 'No expiry dates yet'
  if (summary.status === 'expired') return `Expired qty: ${summary.expiredQuantity}`
  if (summary.status === 'critical') return summary.label
  if (summary.status === 'warning') return summary.label
  if (summary.status === 'none') return 'No expiry dates yet'
  return 'Fresh'
}

const expiryClass = (item) => {
  const status = expiryAlertMap.value[item.id]?.status
  if (status === 'expired') return 'expiry-pill expired'
  if (status === 'critical') return 'expiry-pill critical'
  if (status === 'warning') return 'expiry-pill warning'
  return 'expiry-pill ok'
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

      <select v-model="expiryFilter" class="select-field items-expiry-filter">
        <option value="all">All Expiry</option>
        <option value="expired">Expired</option>
        <option value="critical">Urgent</option>
        <option value="warning">Near Expiry</option>
        <option value="fresh">Fresh</option>
        <option value="not-tracked">Not Tracked</option>
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

    <div v-if="expiryCounts.expired || expiryCounts.critical || expiryCounts.warning" class="expiry-summary-banner">
      <strong>Expiry alerts</strong>
      <span v-if="expiryCounts.expired">{{ expiryCounts.expired }} expired</span>
      <span v-if="expiryCounts.critical">{{ expiryCounts.critical }} urgent</span>
      <span v-if="expiryCounts.warning">{{ expiryCounts.warning }} near expiry</span>
    </div>

    <div class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
      <table>
        <thead>
          <tr>
            <th v-if="visibleCols.name" @click="toggleSort('name')" style="cursor:pointer">
              Name
              <span v-if="sortBy === 'name'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span>
            </th>
            <th v-if="visibleCols.type">Type</th>
            <th v-if="visibleCols.inventory_mode">Inventory Mode</th>
            <th v-if="visibleCols.regular_price">Regular Price</th>
            <th v-if="visibleCols.discount_price">Discount Price</th>
            <th v-if="visibleCols.stock" @click="toggleSort('stock')" style="cursor:pointer">
              Stock
              <span v-if="sortBy === 'stock'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span>
            </th>
            <th v-if="visibleCols.expiry_alert">Expiry Alert</th>
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
          <tr v-for="item in items" :key="item.id">
            <td v-if="visibleCols.name">
              <div class="item-name">{{ item.name }}</div>
              <div v-if="item.description" class="item-description">{{ item.description }}</div>
            </td>
            <td v-if="visibleCols.type" class="caps">{{ item.item_type }}</td>
            <td v-if="visibleCols.inventory_mode">{{ inventoryModeLabel(item) }}</td>
            <td v-if="visibleCols.regular_price">PHP {{ item.price1 }}</td>
            <td v-if="visibleCols.discount_price">PHP {{ item.price2 || 0 }}</td>
            <td v-if="visibleCols.stock">
              <div class="stock-cell">
                <strong>{{ stockLabel(item).primary }}</strong>
                <small v-if="stockLabel(item).secondary">{{ stockLabel(item).secondary }}</small>
              </div>
            </td>
            <td v-if="visibleCols.expiry_alert"><span :class="expiryClass(item)">{{ expirySummaryLabel(item) }}</span></td>
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
            <td :colspan="visibleColumnCount" class="empty-state-cell">No items found.</td>
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

.expiry-summary-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(249, 115, 22, 0.08);
  border: 1px solid rgba(249, 115, 22, 0.18);
  color: #9a3412;
}

.expiry-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.expiry-pill.ok {
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
}

.expiry-pill.warning {
  background: rgba(249, 115, 22, 0.14);
  color: #9a3412;
}

.expiry-pill.critical,
.expiry-pill.expired {
  background: rgba(220, 38, 38, 0.12);
  color: #991b1b;
}

.item-name {
  font-weight: 700;
}

.item-description {
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
}

.stock-cell {
  display: grid;
  gap: 2px;
}

.stock-cell strong {
  font-weight: 700;
  color: #0f172a;
}

.stock-cell small {
  color: #64748b;
  font-size: 12px;
}

.caps {
  text-transform: capitalize;
}

.actions-td button {
  margin-right: 6px !important;
  padding: 6px 10px !important;
}

.items-page .table-wrap.table-wrap-menu-open {
  overflow: visible;
  z-index: 30;
}

.items-page .col-menu {
  top: calc(100% + 8px);
  right: 0;
  z-index: 400;
}

.items-expiry-filter {
  min-width: 156px;
}

@media (max-width: 768px) {
  .items-expiry-filter,
  .items-per-page > .select-field {
    flex: 1;
  }
}
</style>