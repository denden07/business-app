import { dbPromise } from '../db'
import { collectFromSource, reduceFromSource } from '../db/query'

export default {
  namespaced: true,

  state: () => ({
    medicines: [],
    stockMap: {},
    priceHistoryMap: {},
    currentPage: 1,
    itemsPerPage: 10,
    totalCount: 0,
    loading: false
  }),

  getters: {
    totalPages: state =>
      Math.ceil(state.totalCount / state.itemsPerPage)
  },

  mutations: {
    SET_MEDICINES(state, list) {
      state.medicines = list
    },
    SET_STOCK_MAP(state, map) {
      state.stockMap = map
    },
    SET_PRICE_HISTORY_MAP(state, map) {
      state.priceHistoryMap = map
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
    // =============================
    // LOAD PAGE (DB SIDE FILTER)
    // =============================
    async loadMedicinesPage(
      { commit, state, dispatch },
      { page, itemsPerPage, filter, keyword, sortBy, sortOrder }
    ) {
      commit('SET_LOADING', true)

      const db = await dbPromise
      const store = db.transaction('medicines').objectStore('medicines')
      const normalizedKeyword = (keyword || '').trim().toLowerCase()

      if (!normalizedKeyword && sortBy !== 'stock') {
        const source = sortBy === 'name'
          ? store.index('name')
          : store.index('updated_at')
        const direction = sortBy === 'name'
          ? (sortOrder === 'asc' ? 'next' : 'prev')
          : 'prev'

        let totalCount = 0
        let countCursor = await source.openCursor(null, direction)
        while (countCursor) {
          const medicine = { is_archived: false, ...countCursor.value }
          if (matchesFilter(medicine, filter)) {
            totalCount += 1
          }
          countCursor = await countCursor.continue()
        }

        commit('SET_TOTAL_COUNT', totalCount)

        const offset = (page - 1) * itemsPerPage
        const list = []
        let matched = 0
        let cursor = await source.openCursor(null, direction)
        while (cursor) {
          const medicine = { is_archived: false, ...cursor.value }
          if (!matchesFilter(medicine, filter)) {
            cursor = await cursor.continue()
            continue
          }

          if (matched >= offset && list.length < itemsPerPage) {
            list.push(medicine)
          }

          matched += 1
          if (list.length >= itemsPerPage) {
            break
          }

          cursor = await cursor.continue()
        }

        commit('SET_MEDICINES', list)
        await dispatch('loadStockForPage')
        await dispatch('loadPriceHistoryForPage')
        commit('SET_LOADING', false)
        return
      }

      // Fallback path for substring search and derived stock sorting.
      const all = []
      let cursor = await store.openCursor()
      while (cursor) {
        const m = { is_archived: false, ...cursor.value }

        // FILTER
        if (!matchesFilter(m, filter)) {
          cursor = await cursor.continue()
          continue
        }

        // SEARCH
        if (normalizedKeyword) {
          if (
            !m.name.toLowerCase().includes(normalizedKeyword) &&
            !(m.generic_name || '').toLowerCase().includes(normalizedKeyword)
          ) {
            cursor = await cursor.continue()
            continue
          }
        }

        all.push(m)
        cursor = await cursor.continue()
      }

      commit('SET_TOTAL_COUNT', all.length)

      // Apply sorting
      const order = (a, b, dir = 'desc') => (dir === 'asc' ? a - b : b - a)

      if (sortBy === 'name') {
        all.sort((a, b) => {
          const na = (a.name || '').toLowerCase()
          const nb = (b.name || '').toLowerCase()
          if (na === nb) return 0
          if (sortOrder === 'asc') return na < nb ? -1 : 1
          return na > nb ? -1 : 1
        })
      } else if (sortBy === 'stock') {
        // compute stock for all items
        const invStore = db.transaction('inventory_batches').objectStore('inventory_batches')
        const stockMap = {}
        let c2 = await invStore.openCursor()
        while (c2) {
          const b = c2.value
          if (!stockMap[b.medicine_id]) stockMap[b.medicine_id] = 0
          stockMap[b.medicine_id] += b.quantity || 0
          c2 = await c2.continue()
        }
        all.sort((a, b) => {
          const sa = stockMap[a.id] || 0
          const sb = stockMap[b.id] || 0
          return sortOrder === 'asc' ? sa - sb : sb - sa
        })
      } else {
        // default: sort by most recent activity (sold or updated), then by id
        all.sort((a, b) => {
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

      // Paginate
      const offset = (page - 1) * itemsPerPage
      const list = all.slice(offset, offset + itemsPerPage)

      commit('SET_MEDICINES', list)

      // Load related data only for this page
      await dispatch('loadStockForPage')
      await dispatch('loadPriceHistoryForPage')

      commit('SET_LOADING', false)
    },

    // =============================
    // PAGE STOCK
    // =============================
    async loadStockForPage({ state, commit }) {
      const db = await dbPromise
      const index = db.transaction('inventory_batches').objectStore('inventory_batches').index('medicine_id')

      const ids = state.medicines.map(m => m.id)
      const map = {}

      if (!ids.length) {
        commit('SET_STOCK_MAP', {})
        return
      }

      for (const id of ids) {
        const total = await reduceFromSource(
          index,
          (sum, batch) => sum + Number(batch.quantity || 0),
          0,
          { query: id }
        )
        if (total) {
          map[id] = total
        }
      }

      commit('SET_STOCK_MAP', map)
    },

    // =============================
    // PAGE PRICE HISTORY
    // =============================
    async loadPriceHistoryForPage({ state, commit }) {
      const db = await dbPromise
      const index = db.transaction('price_history').objectStore('price_history').index('medicine_id')

      const ids = state.medicines.map(m => m.id)
      const map = {}

      if (!ids.length) {
        commit('SET_PRICE_HISTORY_MAP', {})
        return
      }

      for (const id of ids) {
        const rows = await collectFromSource(index, { query: id })
        if (rows.length) {
          map[id] = rows
        }
      }

      commit('SET_PRICE_HISTORY_MAP', map)
    },

    // =============================
    // ADD
    // =============================
    async addMedicine(_, medicine) {
      const db = await dbPromise
      const data = {
        ...medicine,
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const id = await db.add('medicines', data)

      await db.add('price_history', {
        medicine_id: id,
        price1: medicine.price1,
        price2: medicine.price2,
        changed_at: new Date().toISOString()
      })

      return id
    },

    // =============================
    // UPDATE
    // =============================
    async updateMedicine(_, medicine) {
      const db = await dbPromise
      const current = await db.get('medicines', medicine.id)

      const priceChanged =
        current.price1 !== medicine.price1 ||
        current.price2 !== medicine.price2

      await db.put('medicines', {
        ...medicine,
        updated_at: new Date().toISOString()
      })

      if (priceChanged) {
        await db.add('price_history', {
          medicine_id: medicine.id,
          price1: medicine.price1,
          price2: medicine.price2,
          changed_at: new Date().toISOString()
        })
      }
    },

    // =============================
    // ARCHIVE / RESTORE
    // =============================
    async archiveMedicine(_, medicine) {
      const db = await dbPromise
      await db.put('medicines', {
        ...medicine,
        is_archived: true,
        updated_at: new Date().toISOString()
      })
    },

    async restoreMedicine(_, medicine) {
      const db = await dbPromise
      await db.put('medicines', {
        ...medicine,
        is_archived: false,
        updated_at: new Date().toISOString()
      })
    },

    async searchMedicines(_, keyword) {
      const db = await dbPromise
      const store = db.transaction('medicines').objectStore('medicines')
      const query = keyword.toLowerCase()
      const results = []
      let cursor = await store.openCursor()
      while (cursor) {
        const medicine = cursor.value
        if ((medicine.name || '').toLowerCase().includes(query)) {
          results.push(medicine)
        }
        cursor = await cursor.continue()
      }
      return results
    }
  }
}

function matchesFilter(medicine, filter) {
  if (filter === 'active') return !medicine.is_archived
  if (filter === 'archived') return !!medicine.is_archived
  return true
}
