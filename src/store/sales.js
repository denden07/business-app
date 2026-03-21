import { dbPromise } from '../db'
import { collectFromSource, reduceFromSource } from '../db/query'
import Swal from 'sweetalert2'

export default {
  namespaced: true,
  state: () => ({
    sales: [],
    saleDetails: null,
    lastSaleId: null,
    currentPage: 1,
    itemsPerPage: 10,
    totalSalesCount: 0,
    loading: false
  }),

  mutations: {
    SET_SALES(state, sales) {
      state.sales = sales
    },
    SET_LAST_SALE_ID(state, id) {
      state.lastSaleId = id
    },
    SET_CURRENT_PAGE(state, page) {
      state.currentPage = page
    },
    SET_ITEMS_PER_PAGE(state, val) {
      state.itemsPerPage = val
    },
    SET_TOTAL_COUNT(state, count) {
      state.totalSalesCount = count
    },
    SET_LOADING(state, val) {
      state.loading = val
    },
    SET_SALE_DETAILS(state, payload) {
      state.saleDetails = payload
    }
  },

  actions: {
    async fetchSaleDetails({ commit }, saleId) {
      const db = await dbPromise

      const sale = await db.transaction('sales').objectStore('sales').get(saleId)

      let customer = null
      if (sale.customer_id) {
        customer = await db
          .transaction('customers')
          .objectStore('customers')
          .get(sale.customer_id)
      }

      const items = await collectFromSource(
        db.transaction('sale_items').objectStore('sale_items').index('sale_id'),
        { query: saleId }
      )

      const medsStore = db.transaction('medicines').objectStore('medicines')

      for (const item of items) {
        const med = await medsStore.get(item.medicine_id)
        item.medicine_name = med?.name || 'Unknown'
      }

      commit('SET_SALE_DETAILS', { sale, customer, items })
    },

    // ======================
    // SAVE SALE
    // ======================
// Inside actions of your sales Vuex module
async saveSale({ commit }, payload) {
  const {
    cart,
    subTotal,
    professionalFee,
    discount,
    finalTotal,
    customer_id,
    moneyGiven,
    change,
    purchased_date,

    // Points
    pointsUsed = 0,
    pointsMultiplier = 1,
    pointsDiscount = 0,
    payment_method = 'Cash'
  } = payload

  if (!cart.length) throw new Error('Cart is empty')

  const db = await dbPromise
  const tx = db.transaction(
    ['sales', 'sale_items', 'inventory_batches', 'points_history', 'yearly_points', 'customers', 'medicines'],
    'readwrite'
  )

  const salesStore = tx.objectStore('sales')
  const itemsStore = tx.objectStore('sale_items')
  const batchesStore = tx.objectStore('inventory_batches')
  const pointsStore = tx.objectStore('points_history')
  const yearlyStore = tx.objectStore('yearly_points')
  const medicinesStore = tx.objectStore('medicines')

  const now = new Date().toISOString()

  // Save sale
  const saleId = await salesStore.add({
    purchased_date: purchased_date ? new Date(purchased_date).toISOString() : now.toISOString(),
    created_at: now,
    customer_id: customer_id || null,
    total_amount: subTotal,
    professional_fee: professionalFee,
    discount,
    final_total: finalTotal,
    money_given: moneyGiven,
    change,
    status: 'completed',
    points_used: pointsUsed,
    points_multiplier: pointsMultiplier,
    points_discount: pointsDiscount,
    payment_method
  })

// Deduct inventory (allow negative quantities)
for (const item of cart) {
  const allBatches = await collectFromSource(
    batchesStore.index('medicine_id'),
    { query: item.id }
  )
  
  let remainingQty = item.qty
  let primaryBatchId = null
  
  // Try to find a batch with sufficient quantity first
  const sufficientBatch = allBatches.find(b => b.quantity >= remainingQty)
  
  if (sufficientBatch) {
    // Deduct from batch with sufficient quantity
    sufficientBatch.quantity -= remainingQty
    await batchesStore.put(sufficientBatch)
    primaryBatchId = sufficientBatch.id
  } else if (allBatches.length > 0) {
    // No sufficient batch, use the first available batch and allow negative
    const firstBatch = allBatches[0]
    firstBatch.quantity -= remainingQty  // This can go negative
    await batchesStore.put(firstBatch)
    primaryBatchId = firstBatch.id
  } else {
    // No batches exist at all, create a negative batch
    primaryBatchId = await batchesStore.add({
      medicine_id: item.id,
      quantity: -remainingQty,  // Create with negative quantity
      batch_number: 'AUTO-NEG-' + Date.now(),
      expiry_date: null,
      cost_price: 0,
      added_date: now
    })
  }

  await itemsStore.add({
    sale_id: saleId,
    medicine_id: item.id,
    quantity: item.qty,
    price_at_sale: item.price,
    price_type: item.priceType,
    batch_id: primaryBatchId,
    is_piece_or_box: 'piece'
  })

  // Update medicine with last_sold_at timestamp
  const medicine = await medicinesStore.get(item.id)
  if (medicine) {
    medicine.last_sold_at = now
    medicine.updated_at = now
    await medicinesStore.put(medicine)
  }
}


  // Handle points
  if (customer_id) {
    const get_now = new Date()
    const year = get_now.getFullYear()
    const yearlyKey = [customer_id, year]

    let yearly = await yearlyStore.get(yearlyKey)
    if (!yearly) yearly = { customer_id, year, points: 0 }

    // Redeem points
    if (pointsUsed > 0) {
      const actualPointsDeducted = pointsUsed * (pointsMultiplier || 1)
      const pointsToDeduct = Math.min(yearly.points, actualPointsDeducted)
      yearly.points -= pointsToDeduct

      await pointsStore.add({
        customer_id,
        date: now,
        type: 'redeem',
        related_sale_id: saleId,
        points: -pointsToDeduct,
        description: `Redeemed ${pointsToDeduct} points × ${pointsMultiplier} = ${pointsUsed}`
      })
    }

    // Earn points
    const pointsEarned = finalTotal / 200
    yearly.points += pointsEarned

    await pointsStore.add({
      customer_id,
      date: now,
      type: 'sale',
      related_sale_id: saleId,
      points: pointsEarned,
      description: `Earned ${pointsEarned.toFixed(2)} points from sale #${saleId}`
    })

    // Update yearly points only
    await yearlyStore.put(yearly)
  }

  await tx.done
  commit('SET_LAST_SALE_ID', saleId)
  return saleId
},


    // ======================
    // LOAD SALES
    // ======================
    async loadSales({ commit }) {
      const db = await dbPromise
      const allSales = await collectFromSource(
        db.transaction('sales').objectStore('sales')
      )

      const sales = allSales
        .map(s => ({
          ...s,
          purchased_date: new Date(s.purchased_date || s.created_at || new Date().toISOString()),
          created_at: new Date(s.created_at || new Date().toISOString()),
          date: new Date(s.date || s.created_at || new Date().toISOString()),
          status: s.status || 'completed'
        }))
        .sort((a, b) => b.date - a.date)

      commit('SET_SALES', sales)
    },

    async loadSalesPage({ commit, state }, filters = {}) {
      commit('SET_LOADING', true)

      const { startDate, endDate, keyword } = filters

      const db = await dbPromise
      const tx = db.transaction('sales')
      const store = tx.objectStore('sales')
      const index = store.index('purchased_date')

      // 1️⃣ Count total sales with filters
      let range = null
      if (startDate && endDate) {
        // Use ISO strings for comparison since purchased_date is stored as ISO string
        range = IDBKeyRange.bound(startDate + 'T00:00:00', endDate + 'T23:59:59')
      } else if (startDate) {
        range = IDBKeyRange.lowerBound(startDate + 'T00:00:00')
      } else if (endDate) {
        range = IDBKeyRange.upperBound(endDate + 'T23:59:59')
      }

      // For total count with filters, we need to iterate through cursor
      let totalCount = 0
      let cursor = await index.openCursor(range, 'prev')
      while (cursor) {
        if (!keyword || String(cursor.value.id).includes(keyword)) totalCount++
        cursor = await cursor.continue()
      }
      commit('SET_TOTAL_COUNT', totalCount)

      // 2️⃣ Get paginated data
      const offset = (state.currentPage - 1) * state.itemsPerPage
      const sales = []
      let i = 0

      cursor = await index.openCursor(range, 'prev')
      while (cursor) {
        if (!keyword || String(cursor.value.id).includes(keyword)) {
          if (i >= offset && sales.length < state.itemsPerPage) sales.push(cursor.value)
          i++
        }
        if (sales.length >= state.itemsPerPage) break
        cursor = await cursor.continue()
      }

      commit('SET_SALES', normalize(sales))
      commit('SET_LOADING', false)
    },



    // ======================
    // VIEW SALE ITEMS
    // ======================
    async viewSale(_, saleId) {
      const db = await dbPromise
      const tx = db.transaction(['sale_items', 'medicines'])
      const itemsStore = tx.objectStore('sale_items')
      const medsStore = tx.objectStore('medicines')

      const items = await collectFromSource(itemsStore.index('sale_id'), { query: saleId })

      for (const item of items) {
        const med = await medsStore.get(item.medicine_id)
        item.medicine_name = med?.name || 'Unknown'
        item.generic_name = med?.generic_name || ''
      }

      return items
    },

    // ======================
    // VOID SALE
    // ======================
async voidSale(_, sale) {
  const result = await Swal.fire({
    title: 'Void Sale?',
    text: 'This will restore inventory, return redeemed points, and remove earned points from this sale.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e74c3c',
    confirmButtonText: 'Yes, void it'
  })
  if (!result.isConfirmed) return

  const db = await dbPromise

  // 1️⃣ Restore inventory
  const items = await collectFromSource(
    db.transaction('sale_items').objectStore('sale_items').index('sale_id'),
    { query: sale.id }
  )

  const invTx = db.transaction('inventory_batches', 'readwrite')
  const batchStore = invTx.objectStore('inventory_batches')

  for (const item of items) {
    if (!item.batch_id) continue
    const batch = await batchStore.get(item.batch_id)
    if (batch) {
      batch.quantity += Number(item.quantity || 0)
      await batchStore.put(batch)
    }
  }
  await invTx.done

  // 2️⃣ Adjust points (only points_history and yearly_points)
  if (sale.customer_id) {
    const tx = db.transaction(['points_history', 'yearly_points'], 'readwrite')
    const pointsStore = tx.objectStore('points_history')
    const yearlyStore = tx.objectStore('yearly_points')
    const now = new Date()

    const points = await collectFromSource(pointsStore.index('related_sale_id'), { query: sale.id })

    const year = new Date().getFullYear()
    const yearlyKey = [sale.customer_id, year]
    const yearly = (await yearlyStore.get(yearlyKey)) || { customer_id: sale.customer_id, year, points: 0 }

    for (const p of points) {
      if (p.type === 'redeem') {
        // Return redeemed points
        const returnedPoints = -p.points
        yearly.points += returnedPoints

        await pointsStore.add({
          customer_id: p.customer_id,
          date: now,
          type: 'Redeem Returned',
          related_sale_id: sale.id,
          points: returnedPoints,
          description: `Returned ${Math.abs(returnedPoints)} points from voided sale #${sale.id}`
        })
      } else if (p.type === 'sale') {
        // Remove earned points
        yearly.points -= p.points
        if (yearly.points < 0) yearly.points = 0

        await pointsStore.add({
          customer_id: p.customer_id,
          date: now,
          type: 'Earned Voided',
          related_sale_id: sale.id,
          points: -p.points,
          description: `Removed ${p.points} earned points from voided sale #${sale.id}`
        })
      }
    }

    await yearlyStore.put(yearly)
    await tx.done
  }

  // 3️⃣ Mark sale as voided
  const salesTx = db.transaction('sales', 'readwrite')
  const s = await salesTx.objectStore('sales').get(sale.id)
  if (s) {
    s.status = 'voided'
    await salesTx.objectStore('sales').put(s)
  }
  await salesTx.done

},



    // ======================
    // GET MEDICINES MAP
    // ======================
    async getMedicinesMap() {
      const db = await dbPromise
      const medsStore = db.transaction('medicines').objectStore('medicines')
      return reduceFromSource(
        medsStore,
        (map, med) => {
          map[med.id] = med
          return map
        },
        {}
      )
    },

    async exportSalesByDateRange(_, { startDate, endDate }) {
      const db = await dbPromise

      const tx = db.transaction(
        ['sales', 'sale_items', 'medicines', 'customers'],
        'readonly'
      )

      const salesStore = tx.objectStore('sales')
      const itemsStore = tx.objectStore('sale_items')
      const medsStore = tx.objectStore('medicines')
      const custStore = tx.objectStore('customers')

      const start = new Date(startDate)
      const end = new Date(endDate + 'T23:59:59')

      const rows = []
      let totalSales = 0
      let transactionCount = 0

      let cursor = await salesStore.openCursor()
      while (cursor) {
        const sale = cursor.value
        const saleDate = new Date(sale.purchased_date)

        if (saleDate >= start && saleDate <= end) {
          transactionCount++
          totalSales += Number(sale.final_total || 0)

          const customer =
            sale.customer_id
              ? await custStore.get(sale.customer_id)
              : null

          const itemsIndex = itemsStore.index('sale_id')
          let itemCursor = await itemsIndex.openCursor(sale.id)

          const medicineNames = []

          while (itemCursor) {
            const item = itemCursor.value
            const med = await medsStore.get(item.medicine_id)

            medicineNames.push(med?.name || item.medicine_name || '')

            itemCursor = await itemCursor.continue()
          }

          rows.push({
            sale_id: sale.id,
            purchased_date: sale.purchased_date,
            status: sale.status,
            customer_name: customer ? customer.name : '',
            medicines: medicineNames.join(', '),
            subtotal: sale.total_amount,
            professional_fee: sale.professional_fee,
            discount: sale.discount,
            final_total: sale.final_total,
            money_given: sale.money_given,
            change: sale.change,
            payment_method: sale.payment_method || 'Cash'
          })
        }

        cursor = await cursor.continue()
      }

      return { rows, transactionCount, totalSales }
    }

  }
}

function normalize(list) {
  return list.map(s => ({
    ...s,
    purchased_date: new Date(s.purchased_date),
    status: s.status || 'completed'
  }))
}
