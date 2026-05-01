<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ItemForm from '../components/ItemForm.vue'
import Pagination from '../components/Pagination.vue'
import SearchInput from '../components/SearchInput.vue'
import { dbPromise } from '../db'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import Swal from 'sweetalert2'
import { format } from 'date-fns'
import { isWithinLocalDateRange } from '../utils/dateRange'
import { collectFromSource } from '../db/query'
import { summarizeExpiryForBatches, classifyExpiryDate, getDaysUntilExpiry } from '../utils/expiryAlerts'
import {
  formatSaleOptionQuantity,
  getCustomSaleOptionKey,
  normalizeSaleOptionRecord,
} from '../utils/itemSaleOptions'
import { formatCurrency } from '../utils/numberFormat'
import { getTemplateExpiryAlertSettings } from '../utils/templatePresentation'
import { loadResolvedActiveTemplate } from '../utils/templatePreferences'

const route = useRoute()
const router = useRouter()

const itemId = computed(() => Number(route.params.id))

const item = ref(null)
const batchEntries = ref([])
const stockEntries = ref([])
const priceEntries = ref([])
const showForm = ref(false)
const editingItem = ref(null)
const expirySummary = ref(null)
const expiryAlertSettings = ref({ warningDays: 30, criticalDays: 7 })

const validTabs = new Set(['stock', 'prices', 'selling-options'])

const activeTab = ref(validTabs.has(route.query.tab) ? route.query.tab : 'stock')
const startDate = ref('')
const endDate = ref('')
const dateRange = ref(null)
const isDark = ref(localStorage.getItem('darkMode') === 'true')
const searchKeyword = ref('')
const sortOrder = ref('desc')
const expiryStatusFilter = ref('all')
const movementTypeFilter = ref('all')
const currentPage = ref(1)
const itemsPerPage = ref(10)
const itemsPerPageOptions = [5, 10, 20, 50]
const colMenuOpen = ref(false)
const showAdjustStockModal = ref(false)
const stockAdjustmentForm = ref(createStockAdjustmentForm())
const saleOptions = ref([])
const showSaleOptionModal = ref(false)
const editingSaleOption = ref(null)
const saleOptionForm = ref(createSaleOptionForm())

const _detailDefaultCols = {
  stock_date: true,
  stock_label: true,
  stock_qty: true,
  stock_expiry: true,
  price_date: true,
  price_regular: true,
  price_discount: true,
}

const visibleCols = ref({
  ..._detailDefaultCols,
  ...JSON.parse(localStorage.getItem('col-vis-item-details') || '{}')
})

watch(visibleCols, value => {
  localStorage.setItem('col-vis-item-details', JSON.stringify(value))
}, { deep: true })

watch(dateRange, (range) => {
  if (range && range[0] && range[1]) {
    startDate.value = format(range[0], 'yyyy-MM-dd')
    endDate.value = format(range[1], 'yyyy-MM-dd')
  } else {
    startDate.value = ''
    endDate.value = ''
  }
})

const stockCols = [
  { key: 'stock_date', label: 'Date' },
  { key: 'stock_label', label: 'Label' },
  { key: 'stock_qty', label: 'Qty' },
  { key: 'stock_expiry', label: 'Expiry' },
]

const priceCols = [
  { key: 'price_date', label: 'Date' },
  { key: 'price_regular', label: 'Regular' },
  { key: 'price_discount', label: 'Discount' },
]

const activeCols = computed(() => activeTab.value === 'stock' ? stockCols : priceCols)

const lastVisibleColumnKey = computed(() => {
  const visibleActiveCols = activeCols.value.filter(col => visibleCols.value[col.key])
  return visibleActiveCols.at(-1)?.key || activeCols.value.at(-1)?.key || null
})

const visibleColumnCount = computed(() => {
  const count = activeCols.value.filter(col => visibleCols.value[col.key]).length
  return Math.max(1, count) + (activeTab.value === 'stock' && item.value?.track_stock ? 1 : 0)
})

const toggleCol = (key) => {
  visibleCols.value[key] = !visibleCols.value[key]
}

const toggleColumnMenu = () => {
  colMenuOpen.value = !colMenuOpen.value
}

const formatDateTime = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

const formatDateOnly = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

const toMoney = (value) => formatCurrency(value)
const getPrice1 = (entry) => Number(entry.price1 ?? entry.new_price1 ?? entry.old_price1 ?? 0)
const getPrice2 = (entry) => Number(entry.price2 ?? entry.new_price2 ?? entry.old_price2 ?? 0)
const getStockEntryTimestamp = (entry) => entry?.created_at || entry?.added_date || null
const getStockHistoryQuantity = (entry) => Number(entry?.display_quantity ?? entry?.quantity ?? 0)

const loadItemData = async () => {
  const db = await dbPromise
  const template = await loadResolvedActiveTemplate()
  const templateExpiryAlertSettings = getTemplateExpiryAlertSettings(template)
  const currentItem = await db.get('items', itemId.value)

  if (!currentItem) {
    item.value = null
    batchEntries.value = []
    stockEntries.value = []
    priceEntries.value = []
    expirySummary.value = null
    return
  }

  expiryAlertSettings.value = templateExpiryAlertSettings
  item.value = currentItem

  const priceIndex = db.transaction('item_price_history').objectStore('item_price_history').index('item_id')
  const allPrices = await collectFromSource(priceIndex, { query: IDBKeyRange.only(itemId.value) })
  priceEntries.value = allPrices.sort((left, right) => new Date(right.changed_at) - new Date(left.changed_at))

  const saleOptionIndex = db.transaction('item_sale_options').objectStore('item_sale_options').index('item_id')
  const allSaleOptions = await collectFromSource(saleOptionIndex, { query: IDBKeyRange.only(itemId.value) })
  saleOptions.value = allSaleOptions
    .map(normalizeSaleOptionRecord)
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0))

  if (!currentItem.track_stock) {
    batchEntries.value = []
    stockEntries.value = []
    return
  }

  const stockIndex = db.transaction('item_batches').objectStore('item_batches').index('item_id')
  const allStock = await collectItemBatches(stockIndex, itemId.value)
  batchEntries.value = allStock
  expirySummary.value = summarizeExpiryForBatches(allStock, {
    trackExpiry: !!currentItem.track_expiry,
    ...expiryAlertSettings.value,
  })

  const saleItemsIndex = db.transaction('sale_items').objectStore('sale_items').index('item_id')
  const relatedSaleItems = await collectFromSource(saleItemsIndex, { query: itemId.value })
  const salesStore = db.transaction('sales').objectStore('sales')

  const saleHistoryEntries = (await Promise.all(relatedSaleItems.map(async (saleItem) => {
    const saleRecord = await salesStore.get(saleItem.sale_id)
    if (!saleRecord || saleRecord.status === 'voided') {
      return null
    }

    const sourceBatch = allStock.find(entry => Number(entry?.id || 0) === Number(saleItem.batch_id || 0)) || null
    const quantityInBaseUnits = Number(saleItem.quantity_in_base_units ?? saleItem.quantity ?? 0)
    if (quantityInBaseUnits <= 0) {
      return null
    }

    return {
      id: `sale-history-${saleItem.id}`,
      quantity: -Math.abs(quantityInBaseUnits),
      created_at: saleRecord.purchased_date || saleRecord.created_at || null,
      added_date: saleRecord.created_at || null,
      reason: 'SALE',
      sale_id: saleItem.sale_id,
      expiry_date: sourceBatch?.expiry_date || '',
      batch_number: sourceBatch?.batch_number || '',
      sale_option_label: saleItem.sale_option_label || '',
      batch_id: saleItem.batch_id || null,
      history_source: 'sale_item',
    }
  }))).filter(Boolean)

  const deductedQuantityByBatchId = saleHistoryEntries.reduce((map, entry) => {
    const batchId = Number(entry?.batch_id || 0)
    if (!batchId) {
      return map
    }

    map.set(batchId, (map.get(batchId) || 0) + Math.abs(Number(entry.quantity || 0)))
    return map
  }, new Map())

  const stockHistoryBatchEntries = allStock.map(entry => {
    const deductedQuantity = deductedQuantityByBatchId.get(Number(entry?.id || 0)) || 0
    return {
      ...entry,
      display_quantity: Number(entry?.quantity || 0) + deductedQuantity,
    }
  })

  stockEntries.value = [...stockHistoryBatchEntries, ...saleHistoryEntries].sort((left, right) => {
    const leftDate = new Date(getStockEntryTimestamp(left) || 0)
    const rightDate = new Date(getStockEntryTimestamp(right) || 0)
    return rightDate - leftDate
  })
}

onMounted(loadItemData)

watch(() => route.params.id, () => {
  loadItemData()
})

watch(activeTab, (tab) => {
  if (tab === 'selling-options' && item.value?.item_type === 'service') {
    activeTab.value = 'stock'
    return
  }
  currentPage.value = 1
  colMenuOpen.value = false
  router.replace({ query: { ...route.query, tab } })
})

watch(() => route.query.tab, (tab) => {
  const normalizedTab = validTabs.has(tab) ? tab : 'stock'
  const nextTab = normalizedTab === 'selling-options' && item.value?.item_type === 'service'
    ? 'stock'
    : normalizedTab
  if (activeTab.value !== nextTab) {
    activeTab.value = nextTab
  }
})

watch([searchKeyword, startDate, endDate, sortOrder, itemsPerPage, expiryStatusFilter, movementTypeFilter], () => {
  currentPage.value = 1
})

const totalStock = computed(() =>
  batchEntries.value.reduce((sum, entry) => sum + Number(entry?.quantity || 0), 0)
)

const expiredStock = computed(() => Number(expirySummary.value?.expiredQuantity || 0))

const inventoryModeLabel = computed(() => {
  if (!item.value) return '—'
  if (!item.value.track_stock) return item.value.item_type === 'service' ? 'Service' : 'No stock tracking'
  return item.value.track_expiry ? 'Manual stock + expiry alerts' : 'Manual stock only'
})

const stockStatus = computed(() => {
  if (!item.value) return '—'
  if (!item.value.track_stock) return item.value.item_type === 'service' ? 'Service item' : 'Inventory disabled'
  if (expirySummary.value?.status === 'expired' && totalStock.value <= 0) return 'Only expired stock remains'
  if (totalStock.value <= 0) return 'Out of stock'
  if (totalStock.value < 10) return 'Low stock'
  return 'In stock'
})

const expiryHeadline = computed(() => {
  if (!item.value?.track_expiry) return 'Expiry tracking disabled'
  if (!expirySummary.value) return 'Loading expiry status...'
  if (expirySummary.value.status === 'expired') return expirySummary.value.label || 'Has expired dates'
  if (expirySummary.value.status === 'critical') return expirySummary.value.label
  if (expirySummary.value.status === 'warning') return expirySummary.value.label
  if (expirySummary.value.status === 'none') return 'No active expiry dates yet'
  return 'No active expiry issues'
})

const expiryPanelClass = computed(() => {
  const status = expirySummary.value?.status
  if (status === 'expired') return 'expiry-panel expired'
  if (status === 'critical') return 'expiry-panel critical'
  if (status === 'warning') return 'expiry-panel warning'
  return 'expiry-panel ok'
})

const canManageSellingOptions = computed(() => item.value?.item_type !== 'service')

const itemStateLabel = computed(() => item.value?.is_archived ? 'Archived' : 'Active')

const getEntryExpiryClass = (entry) => {
  if (!item.value?.track_expiry || !entry?.expiry_date) return 'expiry-neutral'

  const status = classifyExpiryDate(entry.expiry_date, expiryAlertSettings.value).status
  if (status === 'expired') return 'expiry-expired'
  if (status === 'critical') return 'expiry-critical'
  if (status === 'warning') return 'expiry-warning'
  return 'expiry-ok'
}

const stockEntryMeta = (entry) => {
  const parts = [formatStockReason(entry?.reason)]
  if (entry?.sale_id) parts.push(`Sale #${entry.sale_id}`)
  if (entry?.expired_removed_at) parts.push('Removed from expiry selector')
  if (entry?.batch_number) parts.push(`Batch ${entry.batch_number}`)
  return parts.filter(Boolean).join(' • ')
}

const getMovementTypeLabel = (entry) => {
  const reason = String(entry?.reason || '').toUpperCase()

  if (reason === 'SALE') return 'Sold'
  if (reason === 'VOID_RESTORE') return 'Void Restore'
  if (reason === 'RESTOCK') return 'Restock'
  if (reason === 'ADJUSTMENT') return 'Adjustment'
  if (reason === 'EXPIRED_REMOVAL') return 'Expired Removal'
  return Number(entry?.quantity || 0) > 0 ? 'Inbound' : 'Outbound'
}

const getMovementTypeClass = (entry) => {
  const reason = String(entry?.reason || '').toUpperCase()

  if (reason === 'SALE' || reason === 'EXPIRED_REMOVAL') return 'movement-badge outbound'
  if (reason === 'VOID_RESTORE' || reason === 'RESTOCK') return 'movement-badge inbound'
  if (reason === 'ADJUSTMENT') return 'movement-badge neutral'
  return Number(entry?.quantity || 0) > 0 ? 'movement-badge inbound' : 'movement-badge outbound'
}

const expiryMetaLabel = (entry) => {
  if (!entry?.expiry_date) return 'Undated batch'

  const daysUntil = getDaysUntilExpiry(entry.expiry_date)
  if (daysUntil === null) return 'Undated batch'
  if (daysUntil < 0) return Math.abs(daysUntil) === 1 ? 'Expired 1 day ago' : `Expired ${Math.abs(daysUntil)} days ago`
  if (daysUntil === 0) return 'Expired today'
  if (daysUntil === 1) return 'Expires in 1 day'
  return `Expires in ${daysUntil} days`
}

const canRemoveExpiredEntry = (entry) => {
  const quantity = Number(entry?.quantity || 0)
  if (!item.value?.track_expiry || quantity <= 0 || !entry?.expiry_date) {
    return false
  }

  return classifyExpiryDate(entry.expiry_date, expiryAlertSettings.value).status === 'expired'
}

const formatStockReason = (value) => {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Inventory movement'

  return normalized
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

async function collectItemBatches(index, itemId) {
  const directMatches = await collectFromSource(index, { query: createExactKeyQuery(itemId) })
  if (directMatches.length) {
    return directMatches
  }

  const numericItemId = Number(itemId)
  const fallbackRows = await collectFromSource(index)
  return fallbackRows.filter(batch => {
    if (Number.isFinite(numericItemId) && Number(batch?.item_id) === numericItemId) {
      return true
    }

    return String(batch?.item_id) === String(itemId)
  })
}

function createExactKeyQuery(value) {
  if (typeof IDBKeyRange !== 'undefined' && typeof IDBKeyRange.only === 'function') {
    return IDBKeyRange.only(value)
  }

  return value
}

const fallbackPriceEntries = computed(() => {
  if (!item.value || priceEntries.value.length) return []

  return [{
    id: `snapshot-${item.value.id}`,
    item_id: item.value.id,
    price1: Number(item.value.price1 || 0),
    price2: Number(item.value.price2 || 0),
    changed_at: item.value.updated_at || item.value.created_at || null,
    is_snapshot: true,
  }]
})

const effectivePriceEntries = computed(() =>
  priceEntries.value.length ? priceEntries.value : fallbackPriceEntries.value
)

const filteredStockEntries = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const entries = [...stockEntries.value]

  const filteredByDate = entries.filter(entry => {
    const entryDate = new Date(getStockEntryTimestamp(entry) || 0)
    return isWithinLocalDateRange(entryDate, startDate.value, endDate.value)
  })

  const filtered = keyword
    ? filteredByDate.filter(entry => {
        const haystack = [
          entry.created_at,
          entry.added_date,
          entry.expiry_date,
          entry.batch_number,
          entry.reason,
          entry.sale_id,
          entry.sale_option_label,
          String(getStockHistoryQuantity(entry)),
        ].join(' ').toLowerCase()

        return haystack.includes(keyword)
      })
    : filteredByDate

  let filteredByMode = filtered

  if (expiryStatusFilter.value !== 'all' && item.value?.track_expiry) {
    filteredByMode = filteredByMode.filter(entry => {
      if (!entry.expiry_date) return expiryStatusFilter.value === 'no-expiry'

      const status = classifyExpiryDate(entry.expiry_date, expiryAlertSettings.value).status

      if (expiryStatusFilter.value === 'expired') return status === 'expired'
      if (expiryStatusFilter.value === 'critical') return status === 'critical'
      if (expiryStatusFilter.value === 'warning') return status === 'warning'
      if (expiryStatusFilter.value === 'ok') return status === 'ok'
      if (expiryStatusFilter.value === 'no-expiry') return false

      return true
    })
  }

  if (movementTypeFilter.value !== 'all') {
    filteredByMode = filteredByMode.filter(entry => {
      const reason = String(entry?.reason || '').toUpperCase()
      const quantity = Number(entry?.quantity || 0)

      if (movementTypeFilter.value === 'inbound') return quantity > 0
      if (movementTypeFilter.value === 'outbound') return quantity < 0
      if (movementTypeFilter.value === reason.toLowerCase()) return true

      return false
    })
  }

  return filteredByMode.sort((left, right) =>
    sortOrder.value === 'asc'
      ? new Date(getStockEntryTimestamp(left) || 0) - new Date(getStockEntryTimestamp(right) || 0)
      : new Date(getStockEntryTimestamp(right) || 0) - new Date(getStockEntryTimestamp(left) || 0)
  )
})

const filteredPriceEntries = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const entries = [...effectivePriceEntries.value]

  const filteredByDate = entries.filter(entry => {
    const entryDate = new Date(entry.changed_at || 0)
    return isWithinLocalDateRange(entryDate, startDate.value, endDate.value)
  })

  const filtered = keyword
    ? filteredByDate.filter(entry => {
        const haystack = [
          entry.changed_at,
          String(getPrice1(entry)),
          String(getPrice2(entry)),
          entry.is_snapshot ? 'current saved price' : '',
        ].join(' ').toLowerCase()

        return haystack.includes(keyword)
      })
    : filteredByDate

  return filtered.sort((left, right) => {
    const leftDate = new Date(left.changed_at || 0)
    const rightDate = new Date(right.changed_at || 0)
    return sortOrder.value === 'asc' ? leftDate - rightDate : rightDate - leftDate
  })
})

const hasDateRangeFilter = computed(() => Boolean(startDate.value && endDate.value))
const activeList = computed(() => activeTab.value === 'stock' ? filteredStockEntries.value : filteredPriceEntries.value)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredStockEntries.value.length / itemsPerPage.value)))
const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return activeList.value.slice(start, start + itemsPerPage.value)
})
const visibleEntryCount = computed(() => paginatedData.value.length)
const latestPriceEntry = computed(() => effectivePriceEntries.value[0] || null)
const activeSaleOptions = computed(() => saleOptions.value.filter(option => option.is_active !== false))
const archivedSaleOptions = computed(() => saleOptions.value.filter(option => option.is_active === false))

const totalPagesForActiveTab = computed(() => Math.max(1, Math.ceil(activeList.value.length / itemsPerPage.value)))

const editItem = () => {
  if (!item.value) return
  editingItem.value = { ...item.value }
  showForm.value = true
}

const closeForm = async (saved = false) => {
  showForm.value = false
  editingItem.value = null

  if (!saved) return

  await loadItemData()
}

const goBack = () => {
  const query = {}
  if (route.query.page) query.page = route.query.page
  if (route.query.search !== undefined) query.search = route.query.search
  if (route.query.filter) query.filter = route.query.filter
  if (route.query.expiry) query.expiry = route.query.expiry
  if (route.query.perPage) query.perPage = route.query.perPage
  if (route.query.sortBy) query.sortBy = route.query.sortBy
  if (route.query.sortOrder) query.sortOrder = route.query.sortOrder

  router.push({ name: 'Items', query })
}

function createStockAdjustmentForm() {
  return {
    reason: 'ADJUSTMENT',
    quantity: null,
    expiry_date: '',
    sourceEntryId: '',
  }
}

function createSaleOptionForm() {
  return {
    option_type: 'bundle',
    label: '',
    price: 0,
    unit_quantity: 10,
  }
}

const saleOptionModalTitle = computed(() => editingSaleOption.value ? 'Edit Selling Option' : 'Add Selling Option')

const saleOptionTypeOptions = [
  { value: 'bundle', label: 'Bundle' },
  { value: 'wholesale', label: 'Wholesale' },
]

watch(() => saleOptionForm.value.option_type, value => {
  if (editingSaleOption.value) return
  if (!saleOptionForm.value.label.trim()) {
    saleOptionForm.value.label = value === 'wholesale' ? 'Wholesale' : 'Bundle'
  }
  if (value === 'wholesale' && Number(saleOptionForm.value.unit_quantity || 0) < 20) {
    saleOptionForm.value.unit_quantity = 24
  }
  if (value === 'bundle' && Number(saleOptionForm.value.unit_quantity || 0) < 2) {
    saleOptionForm.value.unit_quantity = 10
  }
})

const openSaleOptionModal = (option = null) => {
  editingSaleOption.value = option
  saleOptionForm.value = option
    ? {
        option_type: option.option_type,
        label: option.label,
        price: Number(option.price || 0),
        unit_quantity: Number(option.unit_quantity || 1),
      }
    : createSaleOptionForm()

  if (!option) {
    saleOptionForm.value.label = saleOptionForm.value.option_type === 'wholesale' ? 'Wholesale' : 'Bundle'
  }

  showSaleOptionModal.value = true
}

const closeSaleOptionModal = () => {
  showSaleOptionModal.value = false
  editingSaleOption.value = null
  saleOptionForm.value = createSaleOptionForm()
}

const saveSaleOption = async () => {
  if (!item.value) return

  const normalized = normalizeSaleOptionRecord(saleOptionForm.value)
  if (normalized.price <= 0) {
    await Swal.fire({
      icon: 'warning',
      title: 'Invalid price',
      text: 'Enter a selling price greater than 0.'
    })
    return
  }

  if (normalized.unit_quantity <= 1) {
    await Swal.fire({
      icon: 'warning',
      title: 'Invalid quantity',
      text: 'Bundle or wholesale options must contain more than 1 piece.'
    })
    return
  }

  const db = await dbPromise
  const now = new Date().toISOString()
  const payload = {
    item_id: item.value.id,
    option_type: normalized.option_type,
    label: normalized.label,
    price: normalized.price,
    unit_quantity: normalized.unit_quantity,
    is_active: true,
    created_at: editingSaleOption.value?.created_at || now,
    updated_at: now,
  }

  if (editingSaleOption.value?.id) {
    await db.put('item_sale_options', {
      ...editingSaleOption.value,
      ...payload,
      id: editingSaleOption.value.id,
    })
  } else {
    await db.add('item_sale_options', payload)
  }

  closeSaleOptionModal()
  await loadItemData()
}

const archiveSaleOption = async (option) => {
  const result = await Swal.fire({
    icon: 'warning',
    title: 'Archive this selling option?',
    text: `${option.label} will stop appearing in checkout until you restore it.`,
    showCancelButton: true,
    confirmButtonText: 'Archive',
  })

  if (!result.isConfirmed) return

  const db = await dbPromise
  await db.put('item_sale_options', {
    ...option,
    is_active: false,
    updated_at: new Date().toISOString(),
  })
  await loadItemData()
}

const restoreSaleOption = async (option) => {
  const db = await dbPromise
  await db.put('item_sale_options', {
    ...option,
    is_active: true,
    updated_at: new Date().toISOString(),
  })
  await loadItemData()
}

const saleOptionSubtitle = (option) => {
  return `${option.option_type === 'wholesale' ? 'Wholesale' : 'Bundle'} • ${formatSaleOptionQuantity(option)}`
}

const removableExpiredEntries = computed(() => {
  if (!item.value?.track_expiry) return []

  return batchEntries.value
    .filter(entry => {
      const quantity = Number(entry?.quantity || 0)
      if (quantity <= 0) return false
      if (!entry?.expiry_date) return false
      if (entry?.expired_removed) return false
      return classifyExpiryDate(entry.expiry_date, expiryAlertSettings.value).status === 'expired'
    })
    .sort((left, right) => new Date(left.expiry_date) - new Date(right.expiry_date))
    .map(entry => ({
      id: entry.id,
      quantity: Number(entry.quantity || 0),
      expiryDate: entry.expiry_date,
      restockedAt: getStockEntryTimestamp(entry),
      label: `${formatDateTime(getStockEntryTimestamp(entry))} • Expiry ${formatDateOnly(entry.expiry_date)} • Qty ${Number(entry.quantity || 0)}`,
      entry,
    }))
})

const selectedExpiredEntry = computed(() => {
  const sourceEntryId = Number(stockAdjustmentForm.value.sourceEntryId || 0)
  return removableExpiredEntries.value.find(option => option.id === sourceEntryId) || null
})

watch(() => stockAdjustmentForm.value.reason, (reason) => {
  if (reason === 'EXPIRED_REMOVAL') {
    const fallbackOption = removableExpiredEntries.value[0] || null
    stockAdjustmentForm.value.sourceEntryId = fallbackOption ? String(fallbackOption.id) : ''
    stockAdjustmentForm.value.quantity = fallbackOption ? fallbackOption.quantity : null
    stockAdjustmentForm.value.expiry_date = fallbackOption?.expiryDate || ''
    return
  }

  stockAdjustmentForm.value.sourceEntryId = ''
  stockAdjustmentForm.value.quantity = null
})

watch(selectedExpiredEntry, (option) => {
  if (!option || stockAdjustmentForm.value.reason !== 'EXPIRED_REMOVAL') return

  if (!stockAdjustmentForm.value.quantity) {
    stockAdjustmentForm.value.quantity = option.quantity
  }
  stockAdjustmentForm.value.expiry_date = option.expiryDate
})

watch(() => stockAdjustmentForm.value.sourceEntryId, () => {
  if (stockAdjustmentForm.value.reason !== 'EXPIRED_REMOVAL') return
  stockAdjustmentForm.value.quantity = selectedExpiredEntry.value?.quantity ?? null
})

const openAdjustStockModal = (reason = 'ADJUSTMENT') => {
  stockAdjustmentForm.value = createStockAdjustmentForm()
  stockAdjustmentForm.value.reason = reason
  showAdjustStockModal.value = true
}

const saveStockAdjustment = async () => {
  const reason = String(stockAdjustmentForm.value.reason || 'ADJUSTMENT').toUpperCase()
  const quantity = Number(stockAdjustmentForm.value.quantity || 0)

  if (!item.value?.track_stock) {
    return
  }

  if (reason === 'EXPIRED_REMOVAL' && !selectedExpiredEntry.value) {
    await Swal.fire({
      icon: 'warning',
      title: 'No expired entry selected',
      text: 'Select an expired restock entry first.'
    })
    return
  }

  if (!quantity) {
    await Swal.fire({
      icon: 'error',
      title: 'Invalid Quantity',
      text: 'Quantity must not be zero.'
    })
    return
  }

  try {
    const db = await dbPromise
    const tx = db.transaction(['item_batches', 'items'], 'readwrite')
    const itemBatchStore = tx.objectStore('item_batches')
    const itemStore = tx.objectStore('items')
    const now = new Date().toISOString()

    if (reason === 'EXPIRED_REMOVAL') {
      const sourceEntry = await itemBatchStore.get(selectedExpiredEntry.value.id)
      if (!sourceEntry || sourceEntry.expired_removed) {
        throw new Error('This expired entry is no longer available.')
      }

      await itemBatchStore.add({
        item_id: itemId.value,
        quantity: -Math.abs(quantity),
        batch_number: sourceEntry.batch_number || '',
        expiry_date: sourceEntry.expiry_date || '',
        created_at: now,
        reason: 'EXPIRED_REMOVAL',
        source_batch_id: sourceEntry.id,
      })

      await itemBatchStore.put({
        ...sourceEntry,
        expired_removed: true,
        expired_removed_at: now,
        updated_at: now,
      })
    } else {
      const normalizedQuantity = reason === 'RESTOCK' || reason === 'VOID_RESTORE'
        ? Math.abs(quantity)
        : quantity

      await itemBatchStore.add({
        item_id: itemId.value,
        batch_number: '',
        expiry_date: item.value?.track_expiry ? (stockAdjustmentForm.value.expiry_date || '') : '',
        quantity: normalizedQuantity,
        reason,
        created_at: now,
        added_date: now,
      })
    }

    const currentItem = await itemStore.get(item.value.id)
    if (currentItem) {
      await itemStore.put({
        ...currentItem,
        updated_at: now,
      })
    }

    await tx.done

    await Swal.fire({
      icon: 'success',
      title: reason === 'EXPIRED_REMOVAL' ? 'Expired stock removed' : 'Stock adjusted',
      timer: 1500,
      showConfirmButton: false
    })

    showAdjustStockModal.value = false
    stockAdjustmentForm.value = createStockAdjustmentForm()
    await loadItemData()
  } catch (err) {
    console.error('Failed to save stock adjustment', err)
    await Swal.fire({
      icon: 'error',
      title: 'Adjustment failed',
      text: err.message || 'Unable to save this stock adjustment.'
    })
  }
}

const closeAdjustStockModal = () => {
  showAdjustStockModal.value = false
  stockAdjustmentForm.value = createStockAdjustmentForm()
}
</script>

<template>
  <div class="page-shell item-details-page">
    <div class="page-header">
      <div>
        <h1>Item Details</h1>
        <p class="page-subtitle">Item summary, inventory mode, and stock activity for the selected item.</p>
      </div>
      <div class="page-actions">
        <button v-if="item?.track_stock" class="primary" @click="openAdjustStockModal('ADJUSTMENT')">Adjust Stock</button>
        <button v-if="item" class="warning" @click="editItem">Edit Item</button>
        <button class="info back-btn" @click="goBack">← Back to Items</button>
      </div>
    </div>

    <template v-if="item">
      <div class="item-overview-card">
        <div class="item-overview-copy">
          <span class="summary-label">Item Overview</span>
          <h2 class="item-overview-title">{{ item.name }}</h2>
          <p class="item-overview-description">{{ item.description || 'No description added for this item yet.' }}</p>
        </div>

        <div class="item-overview-badges">
          <span class="overview-badge strong caps">{{ item.item_type }}</span>
          <span class="overview-badge">{{ inventoryModeLabel }}</span>
          <span class="overview-badge" :class="item.is_archived ? 'is-archived' : 'is-active'">{{ itemStateLabel }}</span>
          <span class="overview-badge" :class="item.track_stock ? 'is-tracked' : 'is-untracked'">{{ item.track_stock ? stockStatus : 'Stock disabled' }}</span>
        </div>
      </div>

      <div class="customer-summary item-summary primary-summary">
        <div v-if="item.item_type !== 'service'" class="customer-summary-card emphasis-card">
          <span class="summary-label">Current Stock</span>
          <strong class="summary-value">{{ item.track_stock ? totalStock : 'N/A' }}</strong>
          <span class="summary-meta">{{ stockStatus }}</span>
        </div>

        <div v-if="item.item_type !== 'service'" class="customer-summary-card">
          <span class="summary-label">Expired Stock</span>
          <strong class="summary-value">{{ item.track_expiry ? expiredStock : 'N/A' }}</strong>
          <span class="summary-meta">Units currently flagged as expired</span>
        </div>

        <div class="customer-summary-card">
          <span class="summary-label">Regular Price</span>
          <strong class="summary-value">{{ toMoney(item.price1) }}</strong>
          <span class="summary-meta">Current standard selling price</span>
        </div>

        <div class="customer-summary-card">
          <span class="summary-label">Discount Price</span>
          <strong class="summary-value">{{ toMoney(item.price2) }}</strong>
          <span class="summary-meta">Optional alternate selling price</span>
        </div>
      </div>

      <div class="customer-summary item-summary secondary-summary">
        <div v-if="item.item_type !== 'service'" class="customer-summary-card">
          <span class="summary-label">Inventory Tracking</span>
          <strong class="summary-value">{{ item.track_stock ? 'Enabled' : 'Disabled' }}</strong>
          <span class="summary-meta">{{ inventoryModeLabel }}</span>
        </div>

        <div v-if="item.item_type !== 'service'" class="customer-summary-card">
          <span class="summary-label">Availability</span>
          <strong class="summary-value">{{ stockStatus }}</strong>
          <span class="summary-meta">Current stock health for this item</span>
        </div>

        <div class="customer-summary-card" v-if="latestPriceEntry">
          <span class="summary-label">Latest Price Update</span>
          <strong class="summary-value summary-value-compact">{{ formatDateOnly(latestPriceEntry.changed_at) }}</strong>
          <span class="summary-meta">Most recent recorded price change</span>
        </div>
      </div>

      <div v-if="item.track_expiry" :class="expiryPanelClass">
        <strong>{{ expiryHeadline }}</strong>
        <span v-if="expirySummary?.nearestExpiryDate">
          Next expiry: {{ formatDateOnly(expirySummary.nearestExpiryDate) }}
        </span>
        <span>
          Choose an expired restock entry in Adjust Stock to remove it from alerts and stock totals.
        </span>
        <button
          v-if="removableExpiredEntries.length"
          class="secondary btn btn-sm"
          @click="openAdjustStockModal('EXPIRED_REMOVAL')"
        >
          Remove Expired
        </button>
      </div>

      <div class="tabs">
        <button class="tab-button" :class="{ active: activeTab === 'stock' }" @click="activeTab = 'stock'">
          Stock History
        </button>

        <button class="tab-button" :class="{ active: activeTab === 'prices' }" @click="activeTab = 'prices'">
          Price History
        </button>

        <button v-if="canManageSellingOptions" class="tab-button" :class="{ active: activeTab === 'selling-options' }" @click="activeTab = 'selling-options'">
          Selling Options
        </button>
      </div>

      <template v-if="activeTab === 'stock' && item.track_stock">
        <div class="top-bar">
          <SearchInput v-model="searchKeyword" placeholder="Search stock history..." />

          <select v-if="item?.track_expiry" v-model="expiryStatusFilter" class="select-field stock-history-filter">
            <option value="all">All Status</option>
            <option value="expired">Expired</option>
            <option value="critical">Urgent</option>
            <option value="warning">Near Expiry</option>
            <option value="ok">OK/Fresh</option>
            <option value="no-expiry">No Expiry</option>
          </select>

          <select v-model="movementTypeFilter" class="select-field stock-history-filter">
            <option value="all">All Types</option>
            <option value="inbound">Inbound (+)</option>
            <option value="outbound">Outbound (-)</option>
            <option value="sale">Sale</option>
            <option value="restock">Restock</option>
            <option value="adjustment">Adjustment</option>
            <option value="void_restore">Void Restore</option>
            <option value="expired_removal">Expired Removal</option>
          </select>

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

          <select v-model="sortOrder" class="select-field">
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>

          <select v-model.number="itemsPerPage" class="select-field">
            <option v-for="o in itemsPerPageOptions" :key="o" :value="o">{{ o }}</option>
          </select>
        </div>

        <div class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
          <table>
            <thead>
              <tr>
                <th v-if="visibleCols.stock_date">Date</th>
                <th v-if="visibleCols.stock_label">Label</th>
                <th v-if="visibleCols.stock_qty">Qty</th>
                <th v-if="visibleCols.stock_expiry" class="header-with-menu">
                  <div class="th-actions-head">
                    <span>Expiry</span>
                    <div class="col-toggle-wrap">
                      <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                      <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                      <div v-if="colMenuOpen" class="col-menu">
                        <div class="col-menu-title">Columns</div>
                        <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                      </div>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in paginatedData" :key="entry.id" :class="getEntryExpiryClass(entry)">
                <td v-if="visibleCols.stock_date">
                  <div class="stock-date-cell">
                    <span>{{ formatDateTime(getStockEntryTimestamp(entry)) }}</span>
                    <small>{{ stockEntryMeta(entry) }}</small>
                  </div>
                </td>
                <td v-if="visibleCols.stock_label">
                  <small :class="getMovementTypeClass(entry)">{{ getMovementTypeLabel(entry) }}</small>
                </td>
                <td v-if="visibleCols.stock_qty">
                  <div class="stock-qty-cell" :class="getStockHistoryQuantity(entry) > 0 ? 'points-plus' : 'points-minus'">
                    <strong>{{ getStockHistoryQuantity(entry) > 0 ? `+${getStockHistoryQuantity(entry)}` : getStockHistoryQuantity(entry) }}</strong>
                  </div>
                </td>
                <td v-if="visibleCols.stock_expiry">
                  <div class="expiry-cell">
                    <span>{{ entry.expiry_date ? formatDateOnly(entry.expiry_date) : 'No Expiry' }}</span>
                    <small>{{ expiryMetaLabel(entry) }}</small>
                  </div>
                </td>
              </tr>
              <tr v-if="!paginatedData.length">
                <td :colspan="visibleColumnCount" class="empty-state-cell">No stock records found.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Pagination v-model:page="currentPage" :total-pages="totalPagesForActiveTab" :max-pages="5" :item-count="hasDateRangeFilter ? visibleEntryCount : null" :total-items="hasDateRangeFilter ? activeList.length : null" />
      </template>

      <template v-else-if="activeTab === 'selling-options' && canManageSellingOptions">
        <div class="selling-options-panel">
          <div class="selling-options-header">
            <div>
              <h3>Selling Options</h3>
              <p>Create bundle or wholesale selling choices here without adding separate stock items. All options still deduct from this item's expiry-aware stock.</p>
            </div>
            <button class="primary" @click="openSaleOptionModal()">Add Selling Option</button>
          </div>

          <div v-if="activeSaleOptions.length" class="table-wrap selling-options-table-wrap">
            <table class="selling-options-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Units</th>
                  <th>Price</th>
                  <th class="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="option in activeSaleOptions" :key="getCustomSaleOptionKey(option)">
                  <td>
                    <div class="selling-option-primary">{{ option.label }}</div>
                    <div class="selling-option-secondary">{{ saleOptionSubtitle(option) }}</div>
                  </td>
                  <td class="caps">{{ option.option_type }}</td>
                  <td>{{ formatSaleOptionQuantity(option) }}</td>
                  <td>{{ toMoney(option.price) }}</td>
                  <td class="selling-option-actions-cell">
                    <div class="selling-option-actions">
                      <button class="warning btn btn-sm" @click="openSaleOptionModal(option)">Edit</button>
                      <button class="secondary btn btn-sm" @click="archiveSaleOption(option)">Archive</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="selling-options-empty">No bundle or wholesale options yet.</div>

          <div v-if="archivedSaleOptions.length" class="selling-options-archived">
            <h4>Archived Options</h4>
            <div class="table-wrap selling-options-table-wrap archived-table-wrap">
              <table class="selling-options-table archived-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Type</th>
                    <th>Units</th>
                    <th>Price</th>
                    <th class="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="option in archivedSaleOptions" :key="`archived-${option.id}`" class="selling-option-row-archived">
                    <td>
                      <div class="selling-option-primary">{{ option.label }}</div>
                      <div class="selling-option-secondary">{{ saleOptionSubtitle(option) }}</div>
                    </td>
                    <td class="caps">{{ option.option_type }}</td>
                    <td>{{ formatSaleOptionQuantity(option) }}</td>
                    <td>{{ toMoney(option.price) }}</td>
                    <td class="selling-option-actions-cell">
                      <div class="selling-option-actions">
                        <button class="info btn btn-sm" @click="restoreSaleOption(option)">Restore</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </template>

      <template v-else-if="activeTab === 'prices'">

        <div class="top-bar">
          <SearchInput v-model="searchKeyword" placeholder="Search price history..." />

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

          <select v-model="sortOrder" class="select-field">
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>

          <select v-model.number="itemsPerPage" class="select-field">
            <option v-for="o in itemsPerPageOptions" :key="o" :value="o">{{ o }}</option>
          </select>
        </div>

        <div class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
          <table>
            <thead>
              <tr>
                <th v-if="visibleCols.price_date" :class="{ 'header-with-menu': lastVisibleColumnKey === 'price_date' }">
                  <div class="th-actions-head" v-if="lastVisibleColumnKey === 'price_date'">
                    <span>Date</span>
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
                <th v-if="visibleCols.price_regular" :class="{ 'header-with-menu': lastVisibleColumnKey === 'price_regular' }">
                  <div class="th-actions-head" v-if="lastVisibleColumnKey === 'price_regular'">
                    <span>Regular</span>
                    <div class="col-toggle-wrap">
                      <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                      <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                      <div v-if="colMenuOpen" class="col-menu">
                        <div class="col-menu-title">Columns</div>
                        <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                      </div>
                    </div>
                  </div>
                  <template v-else>Regular</template>
                </th>
                <th v-if="visibleCols.price_discount" :class="{ 'header-with-menu': lastVisibleColumnKey === 'price_discount' }">
                  <div class="th-actions-head" v-if="lastVisibleColumnKey === 'price_discount'">
                    <span>Discount</span>
                    <div class="col-toggle-wrap">
                      <button class="col-icon-btn" @click.stop="toggleColumnMenu" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                      <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                      <div v-if="colMenuOpen" class="col-menu">
                        <div class="col-menu-title">Columns</div>
                        <label v-for="col in activeCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                      </div>
                    </div>
                  </div>
                  <template v-else>Discount</template>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in paginatedData" :key="entry.id">
                <td v-if="visibleCols.price_date">{{ formatDateTime(entry.changed_at) }}</td>
                <td v-if="visibleCols.price_regular">{{ toMoney(getPrice1(entry)) }}</td>
                <td v-if="visibleCols.price_discount">{{ toMoney(getPrice2(entry)) }}</td>
              </tr>
              <tr v-if="!paginatedData.length">
                <td :colspan="visibleColumnCount" class="empty-state-cell">No price history found.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Pagination v-model:page="currentPage" :total-pages="totalPagesForActiveTab" :max-pages="5" :item-count="hasDateRangeFilter ? visibleEntryCount : null" :total-items="hasDateRangeFilter ? activeList.length : null" />

        <div class="detail-footnote" v-if="latestPriceEntry">
          Latest recorded price change: {{ formatDateTime(latestPriceEntry.changed_at) }}
          <template v-if="latestPriceEntry.is_snapshot">(current saved price)</template>
        </div>
      </template>

      <div v-else class="empty-state-panel tracking-panel">
        <h2>No stock history</h2>
        <p>This item does not currently track stock. It can still be sold through the mixed checkout flow.</p>
      </div>
    </template>

    <div v-else class="empty-state-panel">
      <h2>Item not found</h2>
      <p>The selected item could not be loaded.</p>
      <button class="secondary" @click="goBack">Back to Items</button>
    </div>

    <ItemForm
      v-if="showForm"
      :itemToEdit="editingItem"
      @close="closeForm"
      @saved="closeForm(true)"
    />

    <div v-if="showAdjustStockModal" class="modal-backdrop" @click.self="closeAdjustStockModal">
      <div class="modal-content">
        <h3>Adjust Stock</h3>

        <div class="form-group">
          <label>Reason</label>
          <select v-model="stockAdjustmentForm.reason" class="select-field">
            <option value="RESTOCK">Restock</option>
            <option value="ADJUSTMENT">Adjustment</option>
            <option v-if="item?.track_expiry" value="EXPIRED_REMOVAL">Expired Removal</option>
          </select>
        </div>

        <div v-if="stockAdjustmentForm.reason === 'EXPIRED_REMOVAL'" class="form-group">
          <label>Expired Restock Entry</label>
          <select v-model="stockAdjustmentForm.sourceEntryId" class="select-field">
            <option value="">Select expired entry</option>
            <option v-for="option in removableExpiredEntries" :key="option.id" :value="String(option.id)">
              {{ option.label }}
            </option>
          </select>
          <small class="modal-helper-text">
            Once removed, this restock entry disappears from the expired selector.
          </small>
          <small v-if="!removableExpiredEntries.length" class="modal-helper-text is-block">
            No expired restock entries are currently available.
          </small>
        </div>

        <div class="form-group">
          <label>Quantity</label>
          <input type="number" v-model.number="stockAdjustmentForm.quantity" class="input" />
          <small class="modal-helper-text">
            {{ stockAdjustmentForm.reason === 'EXPIRED_REMOVAL' ? 'You can change this quantity before saving the expired removal.' : 'Use a negative value to reduce stock and a positive value to add stock.' }}
          </small>
        </div>

        <div class="form-group" v-if="item?.track_expiry && stockAdjustmentForm.reason !== 'EXPIRED_REMOVAL'">
          <label>Expiry Date</label>
          <input type="date" v-model="stockAdjustmentForm.expiry_date" class="input" />
          <small class="modal-helper-text">
            This date is used for alerts only. It does not control which stock gets sold.
          </small>
        </div>

        <div class="modal-actions">
          <button @click="closeAdjustStockModal" class="secondary">Cancel</button>
          <button @click="saveStockAdjustment" class="primary">Save</button>
        </div>
      </div>
    </div>

    <div v-if="showSaleOptionModal" class="modal-backdrop" @click.self="closeSaleOptionModal">
      <div class="modal-content">
        <h3>{{ saleOptionModalTitle }}</h3>

        <div class="form-group">
          <label>Type</label>
          <select v-model="saleOptionForm.option_type" class="select-field">
            <option v-for="option in saleOptionTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>Label</label>
          <input v-model="saleOptionForm.label" type="text" class="input" />
        </div>

        <div class="form-group">
          <label>Price</label>
          <input v-model.number="saleOptionForm.price" type="number" min="0" step="0.01" class="input" />
        </div>

        <div class="form-group">
          <label>Pieces per Sale Unit</label>
          <input v-model.number="saleOptionForm.unit_quantity" type="number" min="2" step="1" class="input" />
          <small class="modal-helper-text">
            The POS will deduct this many pieces from stock each time this option is sold, while still honoring the current expiry logic.
          </small>
        </div>

        <div class="modal-actions">
          <button @click="closeSaleOptionModal" class="secondary">Cancel</button>
          <button @click="saveSaleOption" class="primary">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.item-details-page {
  height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-top: 28px;
  margin-bottom: 14px;
  align-items: center;
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.page-subtitle {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 14px;
}

body.dark-mode .page-subtitle {
  color: #94a3b8;
}

.item-summary {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  align-items: stretch;
}

.primary-summary {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.secondary-summary {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.item-overview-card {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px;
  margin-bottom: 16px;
  border: 1px solid #dbe6e2;
  border-radius: 18px;
  background: linear-gradient(135deg, #ffffff 0%, #f3fbf8 100%);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.07);
}

body.dark-mode .item-overview-card {
  background: linear-gradient(180deg, #162520 0%, #121b18 100%);
  border-color: #244034;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.24);
}

.item-overview-copy {
  display: grid;
  gap: 8px;
}

.item-overview-title {
  margin: 0;
  font-size: 28px;
  line-height: 1.1;
  color: #0f172a;
}

body.dark-mode .item-overview-title {
  color: #f8fafc;
}

.item-overview-description {
  margin: 0;
  max-width: 72ch;
  color: #64748b;
  font-size: 14px;
  line-height: 1.55;
}

body.dark-mode .item-overview-description {
  color: #9fb0c2;
}

.item-overview-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
  justify-content: flex-end;
}

.overview-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.overview-badge.strong {
  background: rgba(26, 188, 156, 0.14);
  color: #0f766e;
}

.overview-badge.is-active,
.overview-badge.is-tracked {
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
}

.overview-badge.is-archived,
.overview-badge.is-untracked {
  background: rgba(148, 163, 184, 0.14);
  color: #475569;
}

body.dark-mode .overview-badge {
  background: rgba(148, 163, 184, 0.18);
  color: #e2e8f0;
}

body.dark-mode .overview-badge.strong {
  background: rgba(26, 188, 156, 0.2);
  color: #99f6e4;
}

body.dark-mode .overview-badge.is-active,
body.dark-mode .overview-badge.is-tracked {
  background: rgba(34, 197, 94, 0.18);
  color: #bbf7d0;
}

body.dark-mode .overview-badge.is-archived,
body.dark-mode .overview-badge.is-untracked {
  background: rgba(148, 163, 184, 0.22);
  color: #dbeafe;
}

.expiry-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid transparent;
}

.expiry-panel.ok {
  background: rgba(34, 197, 94, 0.08);
  border-color: rgba(34, 197, 94, 0.16);
  color: #166534;
}

.selling-options-panel {
  margin-bottom: 16px;
  padding: 18px;
  border: 1px solid #dbe6e2;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fffc 100%);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

body.dark-mode .selling-options-panel {
  background: linear-gradient(180deg, #162520 0%, #121b18 100%);
  border-color: #244034;
}

.selling-options-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.selling-options-header h3,
.selling-options-archived h4 {
  margin: 0 0 6px;
}

.selling-options-header p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

body.dark-mode .selling-options-header p {
  color: #9fb0c2;
}

.selling-options-archived {
  display: grid;
  gap: 10px;
}

.selling-options-table-wrap {
  margin-bottom: 10px;
}

.selling-options-table {
  width: 100%;
}

.selling-options-table tbody td {
  vertical-align: top;
}

.selling-option-primary {
  font-weight: 700;
  color: #0f172a;
}

body.dark-mode .selling-option-primary {
  color: #f8fafc;
}

.selling-option-secondary {
  display: grid;
  margin-top: 3px;
  font-size: 13px;
  color: #64748b;
}

.selling-options-empty {
  color: #64748b;
}

body.dark-mode .selling-option-secondary,
body.dark-mode .selling-options-empty {
  color: #9fb0c2;
}

.selling-option-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.selling-option-actions-cell {
  width: 1%;
  white-space: nowrap;
}

.selling-option-row-archived {
  opacity: 0.72;
}

.expiry-panel.warning {
  background: rgba(249, 115, 22, 0.08);
  border-color: rgba(249, 115, 22, 0.18);
  color: #9a3412;
}

.expiry-panel.critical,
.expiry-panel.expired {
  background: rgba(220, 38, 38, 0.08);
  border-color: rgba(220, 38, 38, 0.18);
  color: #991b1b;
}

body.dark-mode .expiry-panel.ok {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.22);
  color: #86efac;
}

body.dark-mode .expiry-panel.warning {
  background: rgba(249, 115, 22, 0.12);
  border-color: rgba(249, 115, 22, 0.24);
  color: #fdba74;
}

body.dark-mode .expiry-panel.critical,
body.dark-mode .expiry-panel.expired {
  background: rgba(220, 38, 38, 0.12);
  border-color: rgba(220, 38, 38, 0.24);
  color: #fca5a5;
}

.history-primary {
  font-weight: 600;
  color: #0f172a;
}

body.dark-mode .history-primary {
  color: #f8fafc;
}

.history-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

body.dark-mode .history-meta {
  color: #9fb0c2;
}

.stock-history-row td {
  vertical-align: top;
}

.stock-history-row.is-positive td {
  background: rgba(16, 185, 129, 0.03);
}

.stock-history-row.is-negative td {
  background: rgba(239, 68, 68, 0.03);
}

.qty-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.qty-pill-in {
  background: rgba(16, 185, 129, 0.14);
  color: #047857;
}

.qty-pill-out {
  background: rgba(239, 68, 68, 0.14);
  color: #b91c1c;
}

.expiry-ok {
  color: #166534;
}

.expiry-neutral {
  color: #64748b;
}

.customer-summary {
  display: grid;
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

.emphasis-card {
  border-color: rgba(26, 188, 156, 0.24);
  background: linear-gradient(180deg, #ffffff 0%, #edfdf8 100%);
}

body.dark-mode .emphasis-card {
  background: linear-gradient(180deg, #173128 0%, #13231e 100%);
  border-color: rgba(26, 188, 156, 0.22);
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

.summary-value-compact {
  font-size: 18px;
}

body.dark-mode .summary-value {
  color: #f8fafc;
}

.summary-meta {
  color: #64748b;
  font-size: 13px;
}

body.dark-mode .summary-meta {
  color: #9fb0c2;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.caps {
  text-transform: capitalize;
}

.stock-history-filter {
  min-width: 160px;
}

.movement-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.movement-badge.inbound {
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
}

.movement-badge.outbound {
  background: rgba(239, 68, 68, 0.12);
  color: #991b1b;
}

.movement-badge.neutral {
  background: rgba(148, 163, 184, 0.16);
  color: #334155;
}

body.dark-mode .movement-badge.inbound {
  background: rgba(52, 211, 153, 0.18);
  color: #bbf7d0;
}

body.dark-mode .movement-badge.outbound {
  background: rgba(248, 113, 113, 0.18);
  color: #fecaca;
}

body.dark-mode .movement-badge.neutral {
  background: rgba(148, 163, 184, 0.22);
  color: #dbeafe;
}

.stock-date-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.expiry-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stock-date-cell small,
.expiry-cell small {
  color: #64748b;
}

.item-details-page :deep(.dp__main) {
  display: inline-flex;
  width: auto;
}

.item-details-page .table-wrap.table-wrap-menu-open {
  overflow: visible;
  z-index: 30;
}

.item-details-page .table-wrap thead th {
  position: relative;
}

.item-details-page .header-with-menu {
  padding-right: 52px;
}

.item-details-page .th-actions-head {
  justify-content: flex-start;
}

.item-details-page .col-toggle-wrap {
  position: absolute;
  top: 50%;
  right: 14px;
  transform: translateY(-50%);
}

.item-details-page .col-menu {
  top: calc(100% + 8px);
  right: 0;
  z-index: 400;
}

.points-plus {
  color: #1abc9c;
  font-weight: 600;
}

.points-minus {
  color: #e74c3c;
  font-weight: 600;
}

.empty-state-cell {
  text-align: center;
  color: #64748b;
  padding: 20px 12px;
}

body.dark-mode .empty-state-cell {
  color: #9fb0c2;
}

.detail-footnote {
  margin-top: 10px;
  color: #64748b;
  font-size: 13px;
}

body.dark-mode .detail-footnote {
  color: #9fb0c2;
}

.empty-state-panel {
  max-width: 560px;
  margin: 32px auto;
  padding: 24px;
  border-radius: 18px;
  text-align: center;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

body.dark-mode .empty-state-panel {
  background: #1c1c1c;
  border-color: #2e2e2e;
}

.tracking-panel {
  max-width: none;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1200;
}

.modal-content {
  width: min(100%, 460px);
  padding: 22px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}

body.dark-mode .modal-content {
  background: #162520;
  border-color: #244034;
}

.form-group {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}

.modal-helper-text {
  color: #64748b;
  font-size: 12px;
  margin-top: 4px;
}

body.dark-mode .modal-helper-text {
  color: #9fb0c2;
}

.modal-helper-text.is-block {
  display: block;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

@media (max-width: 1024px) {
  .item-overview-card {
    flex-direction: column;
  }

  .item-overview-badges {
    justify-content: flex-start;
  }

  .item-summary {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .secondary-summary {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
}

@media (max-width: 768px) {
  .selling-options-header,
  .selling-option-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .selling-options-table th:nth-child(2),
  .selling-options-table td:nth-child(2),
  .selling-options-table th:nth-child(3),
  .selling-options-table td:nth-child(3) {
    display: none;
  }

  .item-details-page .top-bar > :deep(.dp__main),
  .item-details-page .top-bar > :deep(.date-icon-btn),
  .stock-history-filter {
    width: 100%;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .page-actions {
    width: 100%;
    justify-content: stretch;
  }

  .page-actions > button {
    width: 100%;
  }

  .item-overview-title {
    font-size: 24px;
  }

  .item-summary,
  .secondary-summary {
    grid-template-columns: 1fr;
  }

  .points-card {
    align-items: flex-start;
    text-align: left;
  }

  .modal-actions {
    flex-direction: column-reverse;
  }
}
</style>
