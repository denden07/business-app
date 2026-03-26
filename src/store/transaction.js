import { dbPromise } from '../db'
import { buildCustomerDateKeyRange, buildDateKeyRange } from '../utils/dateRange'
import {
  getSaleAmountPaid,
  getSaleDisplayStatus,
  getSaleOutstandingBalance,
  normalizeSalePaymentStatus,
} from '../utils/saleStatus'

export default {
  namespaced: true,

  state: {
    pointsHistory: [],
    sales: [],
    pointsTotal: 0,
    salesTotal: 0
  },

  mutations: {
    SET_POINTS_HISTORY(state, data) {
      state.pointsHistory = data
    },
    SET_SALES(state, data) {
      state.sales = data
    },
    SET_POINTS_TOTAL(state, total) {
      state.pointsTotal = total
    },
    SET_SALES_TOTAL(state, total) {
      state.salesTotal = total
    }
  },

  actions: {
    /* =========================
       LOAD POINTS HISTORY PAGE
    ========================== */
    async loadPointsHistoryPage(
      { commit },
      { customerId = null, page = 1, perPage = 10, startDate = '', endDate = '', filterType = 'all', sortOrder = 'desc' } = {}
    ) {
      const db = await dbPromise
      const source = customerId
        ? db.transaction('points_history').store.index('customer_date')
        : db.transaction('points_history').store.index('date')
      const direction = sortOrder === 'asc' ? 'next' : 'prev'
      const range = customerId
        ? buildCustomerDateKeyRange(customerId, startDate, endDate)
        : buildDateKeyRange(startDate, endDate)

      let total = 0
      if (filterType === 'all') {
        total = await source.count(range)
      } else {
        let countCursor = await source.openCursor(range, direction)
        while (countCursor) {
          if (countCursor.value.type === filterType) {
            total += 1
          }
          countCursor = await countCursor.continue()
        }
      }

      const offset = (page - 1) * perPage
      const rows = []
      let matched = 0
      let cursor = await source.openCursor(range, direction)
      while (cursor) {
        const row = cursor.value
        if (filterType !== 'all' && row.type !== filterType) {
          cursor = await cursor.continue()
          continue
        }
        if (matched >= offset && rows.length < perPage) {
          rows.push(row)
        }
        matched += 1
        if (rows.length >= perPage) {
          break
        }
        cursor = await cursor.continue()
      }

      commit('SET_POINTS_HISTORY', rows)
      commit('SET_POINTS_TOTAL', total)
      return rows
    },

    /* =========================
       LOAD SALES PAGE
    ========================== */
    async loadSalesPage(
      { commit },
      { customerId = null, page = 1, perPage = 10, startDate = '', endDate = '', sortOrder = 'desc' } = {}
    ) {
      const db = await dbPromise
      const source = customerId
        ? db.transaction('sales').store.index('customer_purchased_date')
        : db.transaction('sales').store.index('purchased_date')
      const direction = sortOrder === 'asc' ? 'next' : 'prev'
      const range = customerId
        ? buildCustomerDateKeyRange(customerId, startDate, endDate)
        : buildDateKeyRange(startDate, endDate)

      const total = await source.count(range)
      const offset = (page - 1) * perPage
      const rows = []
      let skipped = 0
      let cursor = await source.openCursor(range, direction)

      while (cursor) {
        if (skipped < offset) {
          skipped += 1
          cursor = await cursor.continue()
          continue
        }
        rows.push(cursor.value)
        if (rows.length >= perPage) {
          break
        }
        cursor = await cursor.continue()
      }

      commit('SET_SALES', rows.map(normalizeSaleRow))
      commit('SET_SALES_TOTAL', total)
      return rows.map(normalizeSaleRow)
    },

    /* =========================
       ADD POINTS FROM SALE
    ========================== */
    async addPointsFromSale({ dispatch }, payload) {
      const db = await dbPromise
      const points = Math.floor(payload.final_total / 200)
      if (points <= 0) return

      await db.add('points_history', {
        customer_id: payload.customer_id,
        points,
        type: 'sale',
        related_sale_id: payload.sale_id,
        notes: 'Auto from sale',
        date: new Date().toISOString()
      })
    }
  },

  getters: {
    totalPoints: (state) => {
      return state.pointsHistory.reduce((sum, p) => sum + p.points, 0)
    }
  }
}

function normalizeSaleRow(sale) {
  return {
    ...sale,
    payment_status: normalizeSalePaymentStatus(sale),
    amount_paid: getSaleAmountPaid(sale),
    outstanding_balance: getSaleOutstandingBalance(sale),
    display_status: getSaleDisplayStatus(sale),
  }
}

