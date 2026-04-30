import { dbPromise } from '../db'
import { collectFromSource } from '../db/query'
import Swal from 'sweetalert2'
import { getSaleOutstandingBalance } from '../utils/saleStatus'

export default {
  namespaced: true,

  state: () => ({
    page: [],
    total: 0,
    lastCustomerId: null,
    loading: false
  }),

  mutations: {
    SET_PAGE(state, rows) {
      state.page = rows
    },
    SET_TOTAL(state, n) {
      state.total = n
    },
    SET_LAST_CUSTOMER_ID(state, id) {
      state.lastCustomerId = id
    },
    SET_LOADING(state, v) {
      state.loading = v
    }
  },

  actions: {
    /* ==========================
       PAGED LOAD (MAIN ENTRY)
    ========================== */
async loadCustomersPage(
  { commit },
  { page = 1, perPage = 10, search = '', sortBy = 'id', sortOrder = 'desc', debtFilter = 'all' }
) {
  commit('SET_LOADING', true)

  const db = await dbPromise
  const tx = db.transaction(['customers', 'yearly_points', 'sales'], 'readonly')
  const store = tx.objectStore('customers')
  const yearlyStore = tx.objectStore('yearly_points')
  const salesStore = tx.objectStore('sales')
  const query = search.trim().toLowerCase()
  const canUseIndexedPaging = !query && debtFilter === 'all' && sortBy !== 'points' && sortBy !== 'outstanding_debt'

  if (canUseIndexedPaging) {
    const source = sortBy === 'name' ? store.index('name') : store
    const direction = sortOrder === 'asc' ? 'next' : 'prev'
    const total = await source.count()
    const offset = (page - 1) * perPage
    const rows = []
    let skipped = 0
    let cursor = await source.openCursor(null, direction)

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

    const year = new Date().getFullYear()
    for (const customer of rows) {
      const rec = await yearlyStore.get([customer.id, year])
      customer.points = Number(rec?.points || 0)
      customer.outstanding_debt = await getCustomerOutstandingDebt(salesStore, customer.id)
    }

    commit('SET_PAGE', rows)
    commit('SET_TOTAL', total)
    commit('SET_LOADING', false)
    return
  }

  let all = await collectFromSource(store)

  if (query) {
    all = all.filter(c =>
      c.name?.toLowerCase().includes(query) ||
      (c.phone || '').toLowerCase().includes(query) ||
      (c.email || '').toLowerCase().includes(query)
    )
  }

  // attach yearly points
  const year = new Date().getFullYear()
  for (const c of all) {
    const rec = await yearlyStore.get([c.id, year])
    c.points = Number(rec?.points || 0)
    c.outstanding_debt = await getCustomerOutstandingDebt(salesStore, c.id)
  }

  if (debtFilter === 'has-debt') {
    all = all.filter(customer => Number(customer.outstanding_debt || 0) > 0)
  } else if (debtFilter === 'no-debt') {
    all = all.filter(customer => Number(customer.outstanding_debt || 0) <= 0)
  }

  // sort (SAFE)
  all.sort((a, b) => {
    let A = a[sortBy] ?? 0
    let B = b[sortBy] ?? 0

    if (typeof A === 'string') A = A.toLowerCase()
    if (typeof B === 'string') B = B.toLowerCase()

    return sortOrder === 'asc' ? (A > B ? 1 : -1) : (A < B ? 1 : -1)
  })

  const total = all.length
  const start = (page - 1) * perPage
  const rows = all.slice(start, start + perPage)

  commit('SET_PAGE', rows)
  commit('SET_TOTAL', total)
  commit('SET_LOADING', false)
},






    /* ==========================
       ADD CUSTOMER
    ========================== */
    async addCustomer({ commit }, payload) {
      const db = await dbPromise
      const now = new Date().toISOString()

      const id = await db.add('customers', {
        name: payload.name,
        phone: payload.phone || '',
        email: payload.email || '',
        address: payload.address || '',
        created_at: now,
        updated_at: now
      })

      commit('SET_LAST_CUSTOMER_ID', id)
      return id
    },

    /* ==========================
       EDIT
    ========================== */
    async editCustomer(_, customer) {
      const db = await dbPromise
      await db.put('customers', {
        ...customer,
        updated_at: new Date().toISOString()
      })
    },

    /* ==========================
       DELETE
    ========================== */
    async deleteCustomer(_, customer) {
      const result = await Swal.fire({
        title: 'Delete Customer?',
        text: 'This action cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        confirmButtonText: 'Delete'
      })

      if (!result.isConfirmed) return

      const db = await dbPromise
      await db.delete('customers', customer.id)

      Swal.fire({
        icon: 'success',
        title: 'Customer Deleted',
        timer: 1200,
        showConfirmButton: false
      })
    },

    /* ==========================
       POINTS
    ========================== */
    async addPointsFromSale(_, { customer_id, sale_id, final_total }) {
      if (!customer_id) return

      const points = Math.floor(Number(final_total) / 200)
      if (points <= 0) return

      const db = await dbPromise
      await db.add('points_history', {
        customer_id,
        sale_id,
        points,
        type: 'sale',
        date: new Date().toISOString()
      })
    },


async addManualPoints(_, { customer_id, points, note = '' }) {
  const normalizedCustomerId = Number(customer_id)
  const normalizedPoints = Number(points)

  if (!normalizedCustomerId || !Number.isFinite(normalizedPoints) || normalizedPoints === 0) return

  const db = await dbPromise
  const tx = db.transaction(['points_history', 'yearly_points'], 'readwrite')
  const pointsStore = tx.objectStore('points_history')
  const yearlyStore = tx.objectStore('yearly_points')

  const now = new Date().toISOString()
  const get_now = new Date()
  const year = get_now.getFullYear()
  const yearlyKey = [normalizedCustomerId, year]

  let yearly = await yearlyStore.get(yearlyKey)
  if (!yearly) yearly = { customer_id: normalizedCustomerId, year, points: 0 }

  const appliedPoints = normalizedPoints < 0
    ? -Math.min(yearly.points, Math.abs(normalizedPoints))
    : normalizedPoints

  if (appliedPoints === 0) {
    await tx.done
    return 0
  }

  // 1️⃣ Add to points_history
  await pointsStore.add({
    customer_id: normalizedCustomerId,
    points: appliedPoints,
    type: 'manual',
    description: note || (appliedPoints > 0 ? 'Manual add' : 'Manual deduction'),
    related_sale_id: null,
    date: now
  })

  // 2️⃣ Update yearly_points
  yearly.points += appliedPoints
  if (yearly.points < 0) yearly.points = 0
  await yearlyStore.put(yearly)

  await tx.done
  return yearly.points
},




    async getCustomerPointsHistory(_, customerId) {
      const db = await dbPromise
      const store = db.transaction('points_history').objectStore('points_history')
      return collectFromSource(store.index('customer_id'), { query: customerId })
    },
    async searchCustomers(_, keyword) {
      const db = await dbPromise
      const store = db.transaction('customers').objectStore('customers')
      const query = keyword.toLowerCase()
      const results = []
      let cursor = await store.openCursor()
      while (cursor) {
        const customer = cursor.value
        if ((customer.name || '').toLowerCase().includes(query)) {
          results.push(customer)
        }
        cursor = await cursor.continue()
      }
      return results
    }
  }
}

async function getCustomerOutstandingDebt(salesStore, customerId) {
  const salesByCustomer = await collectFromSource(salesStore.index('customer_id'), { query: customerId })

  return salesByCustomer.reduce((total, sale) => {
    if (sale.status === 'voided') {
      return total
    }

    return total + getSaleOutstandingBalance(sale)
  }, 0)
}
