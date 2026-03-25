import { dbPromise } from '../db'
import { collectFromSource } from '../db/query'
import { summarizeExpiryForBatches, getSellableQuantityFromBatches } from '../utils/expiryAlerts'
import { getTemplateExpiryAlertSettings } from '../utils/templatePresentation'
import { loadResolvedActiveTemplate } from '../utils/templatePreferences'

export default {
  namespaced: true,

  state: () => ({
    items: [],
    stockMap: {},
    expiryAlertMap: {},
    currentPage: 1,
    itemsPerPage: 10,
    totalCount: 0,
    loading: false
  }),

  getters: {
    totalPages: state => Math.ceil(state.totalCount / state.itemsPerPage)
  },

  mutations: {
    SET_ITEMS(state, list) {
      state.items = list
    },
    SET_STOCK_MAP(state, map) {
      state.stockMap = map
    },
    SET_EXPIRY_ALERT_MAP(state, map) {
      state.expiryAlertMap = map
    },
    SET_TOTAL_COUNT(state, count) {
      state.totalCount = count
    },
    SET_CURRENT_PAGE(state, page) {
      state.currentPage = page
    },
    SET_LOADING(state, val) {
      state.loading = val
    }
  },

  actions: {
    async loadItemsPage(
      { commit },
      { page, itemsPerPage, filter, keyword, expiryFilter, sortBy, sortOrder }
    ) {
      commit('SET_LOADING', true)

      const db = await dbPromise
      const store = db.transaction('items').objectStore('items')
      const normalizedKeyword = (keyword || '').trim().toLowerCase()
      const normalizedExpiryFilter = String(expiryFilter || 'all')
      const all = []

      let cursor = await store.openCursor()
      while (cursor) {
        const item = { is_archived: false, ...cursor.value }

        if (!matchesFilter(item, filter)) {
          cursor = await cursor.continue()
          continue
        }

        if (normalizedKeyword) {
          const name = (item.name || '').toLowerCase()
          const description = (item.description || '').toLowerCase()
          if (!name.includes(normalizedKeyword) && !description.includes(normalizedKeyword)) {
            cursor = await cursor.continue()
            continue
          }
        }

        all.push(item)
        cursor = await cursor.continue()
      }

      const template = await loadResolvedActiveTemplate()
      const expiryAlertSettings = getTemplateExpiryAlertSettings(template)
      const allBatches = await db.getAll('item_batches')
      const batchesByItemId = groupBatchesByItemId(allBatches)
      const inventoryState = buildInventoryState(all, batchesByItemId, expiryAlertSettings)

      const filteredItems = all.filter(item =>
        matchesExpiryFilter(item, inventoryState.expiryMap[item.id], normalizedExpiryFilter)
      )

      if (sortBy === 'name') {
        filteredItems.sort((a, b) => {
          const left = (a.name || '').toLowerCase()
          const right = (b.name || '').toLowerCase()
          if (left === right) return 0
          if (sortOrder === 'asc') return left < right ? -1 : 1
          return left > right ? -1 : 1
        })
      } else if (sortBy === 'stock') {
        filteredItems.sort((a, b) => {
          const left = inventoryState.stockMap[a.id] || 0
          const right = inventoryState.stockMap[b.id] || 0
          return sortOrder === 'asc' ? left - right : right - left
        })
      } else {
        filteredItems.sort((a, b) => {
          const soldA = a.last_sold_at ? new Date(a.last_sold_at).getTime() : 0
          const soldB = b.last_sold_at ? new Date(b.last_sold_at).getTime() : 0
          const updatedA = a.updated_at ? new Date(a.updated_at).getTime() : 0
          const updatedB = b.updated_at ? new Date(b.updated_at).getTime() : 0
          const latestA = Math.max(soldA, updatedA)
          const latestB = Math.max(soldB, updatedB)

          if (latestB !== latestA) return latestB - latestA
          return b.id - a.id
        })
      }

      commit('SET_TOTAL_COUNT', filteredItems.length)

      const offset = (page - 1) * itemsPerPage
      const pageItems = filteredItems.slice(offset, offset + itemsPerPage)
      commit('SET_ITEMS', pageItems)
      commit('SET_CURRENT_PAGE', page)

      const pageStockMap = {}
      const pageExpiryMap = {}
      for (const item of pageItems) {
        pageStockMap[item.id] = inventoryState.stockMap[item.id] || 0
        pageExpiryMap[item.id] = inventoryState.expiryMap[item.id] || summarizeExpiryForBatches([], {
          trackExpiry: !!item.track_expiry,
          ...expiryAlertSettings,
        })
      }

      commit('SET_STOCK_MAP', pageStockMap)
      commit('SET_EXPIRY_ALERT_MAP', pageExpiryMap)
      commit('SET_LOADING', false)
    },

    async loadStockForPage({ state, commit }) {
      const db = await dbPromise
      const template = await loadResolvedActiveTemplate()
      const expiryAlertSettings = getTemplateExpiryAlertSettings(template)
      const allBatches = await db.getAll('item_batches')
      const batchesByItemId = groupBatchesByItemId(allBatches)
      const map = {}
      const expiryMap = {}

      for (const item of state.items) {
        if (!item.track_stock) {
          expiryMap[item.id] = summarizeExpiryForBatches([], {
            trackExpiry: !!item.track_expiry,
            ...expiryAlertSettings,
          })
          continue
        }

        const batches = getGroupedItemBatches(batchesByItemId, item.id)
        const summary = summarizeExpiryForBatches(batches, {
          trackExpiry: !!item.track_expiry,
          ...expiryAlertSettings,
        })
        expiryMap[item.id] = summary

        map[item.id] = batches.reduce((sum, batch) => {
          const quantity = Number(batch?.quantity || 0)
          return quantity > 0 ? sum + quantity : sum
        }, 0)
      }

      commit('SET_STOCK_MAP', map)
      commit('SET_EXPIRY_ALERT_MAP', expiryMap)
    },

    async addItem(_, item) {
      const db = await dbPromise
      const now = new Date().toISOString()
      const data = {
        ...normalizeItemPayload(item),
        is_archived: false,
        created_at: now,
        updated_at: now,
        last_sold_at: null
      }

      const itemId = await db.add('items', data)
      await recordItemPriceHistory(db, itemId, data.price1, data.price2, now)
      return itemId
    },

    async updateItem(_, item) {
      const db = await dbPromise
      const current = await db.get('items', item.id)
      const normalized = normalizeItemPayload(item)
      const now = new Date().toISOString()
      const priceChanged =
        Number(current?.price1 || 0) !== normalized.price1 ||
        Number(current?.price2 || 0) !== normalized.price2

      await db.put('items', {
        ...current,
        ...normalized,
        updated_at: now
      })

      if (priceChanged) {
        await recordItemPriceHistory(db, item.id, normalized.price1, normalized.price2, now)
      }
    },

    async archiveItem(_, item) {
      const db = await dbPromise
      await db.put('items', {
        ...item,
        is_archived: true,
        updated_at: new Date().toISOString()
      })
    },

    async restoreItem(_, item) {
      const db = await dbPromise
      await db.put('items', {
        ...item,
        is_archived: false,
        updated_at: new Date().toISOString()
      })
    }
  }
}

function matchesFilter(item, filter) {
  if (filter === 'active') return !item.is_archived
  if (filter === 'archived') return !!item.is_archived
  return true
}

function normalizeItemPayload(item) {
  const itemType = item.item_type === 'service' ? 'service' : 'product'
  const trackStock = itemType === 'product' ? !!item.track_stock : false
  const trackBatches = trackStock ? !!item.track_batches : false
  const trackExpiry = trackBatches ? !!item.track_expiry : false

  const normalized = {
    name: String(item.name || '').trim(),
    description: String(item.description || '').trim(),
    item_type: itemType,
    price1: Number(item.price1 || 0),
    price2: Number(item.price2 || 0),
    track_stock: trackStock,
    track_batches: trackBatches,
    track_expiry: trackExpiry,
    is_archived: !!item.is_archived,
  }

  if (item.id !== undefined && item.id !== null) {
    normalized.id = item.id
  }

  return normalized
}

async function buildItemStockMap(db, expiryAlertSettings = {}) {
  const stockMap = {}
  const allBatches = await db.getAll('item_batches')

  for (const batch of allBatches) {
    const quantity = Number(batch.quantity || 0)
    if (quantity <= 0) {
      continue
    }

    if (!stockMap[batch.item_id]) stockMap[batch.item_id] = 0
    stockMap[batch.item_id] += quantity
  }

  return stockMap
}

function groupBatchesByItemId(batches = []) {
  const grouped = new Map()

  for (const batch of batches) {
    const rawKey = batch?.item_id
    const stringKey = String(rawKey)
    const numericKey = Number(rawKey)

    if (!grouped.has(stringKey)) {
      grouped.set(stringKey, [])
    }
    grouped.get(stringKey).push(batch)

    if (Number.isFinite(numericKey)) {
      const normalizedNumericKey = String(numericKey)
      if (normalizedNumericKey !== stringKey) {
        if (!grouped.has(normalizedNumericKey)) {
          grouped.set(normalizedNumericKey, [])
        }
        grouped.get(normalizedNumericKey).push(batch)
      }
    }
  }

  return grouped
}

function getGroupedItemBatches(grouped, itemId) {
  return grouped.get(String(itemId)) || []
}

async function recordItemPriceHistory(db, itemId, price1, price2, changedAt) {
  await db.add('item_price_history', {
    item_id: itemId,
    price1: Number(price1 || 0),
    price2: Number(price2 || 0),
    changed_at: changedAt || new Date().toISOString()
  })
}

function buildInventoryState(items = [], batchesByItemId = new Map(), expiryAlertSettings = {}) {
  const stockMap = {}
  const expiryMap = {}

  for (const item of items) {
    if (!item.track_stock) {
      expiryMap[item.id] = summarizeExpiryForBatches([], {
        trackExpiry: !!item.track_expiry,
        ...expiryAlertSettings,
      })
      stockMap[item.id] = 0
      continue
    }

    const batches = getGroupedItemBatches(batchesByItemId, item.id)
    expiryMap[item.id] = summarizeExpiryForBatches(batches, {
      trackExpiry: !!item.track_expiry,
      ...expiryAlertSettings,
    })

    stockMap[item.id] = batches.reduce((sum, batch) => {
      const quantity = Number(batch?.quantity || 0)
      return quantity > 0 ? sum + quantity : sum
    }, 0)
  }

  return { stockMap, expiryMap }
}

function matchesExpiryFilter(item, summary, filter) {
  if (filter === 'all') return true
  if (filter === 'not-tracked') return !item.track_expiry
  if (!item.track_expiry) return false

  const status = summary?.status || 'none'
  if (filter === 'expired') return status === 'expired'
  if (filter === 'critical') return status === 'critical'
  if (filter === 'warning') return status === 'warning'
  if (filter === 'fresh') return status === 'ok'

  return true
}