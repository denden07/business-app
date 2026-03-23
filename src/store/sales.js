import { dbPromise } from '../db'
import { collectFromSource, reduceFromSource } from '../db/query'
import { buildDateKeyRange, isWithinLocalDateRange } from '../utils/dateRange'
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

      const itemCatalogStore = db.transaction('items').objectStore('items')

      for (const item of items) {
        await attachCatalogDetails(item, itemCatalogStore)
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
    ['sales', 'sale_items', 'item_batches', 'points_history', 'yearly_points', 'customers', 'items'],
    'readwrite'
  )

  const salesStore = tx.objectStore('sales')
  const saleItemsStore = tx.objectStore('sale_items')
  const itemBatchesStore = tx.objectStore('item_batches')
  const pointsStore = tx.objectStore('points_history')
  const yearlyStore = tx.objectStore('yearly_points')
  const itemCatalogStore = tx.objectStore('items')

  const now = new Date().toISOString()

  // Save sale
  const saleId = await salesStore.add({
    purchased_date: purchased_date ? new Date(purchased_date).toISOString() : now,
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

  for (const item of cart) {
    const sourceId = await resolveCatalogItemId(item, itemCatalogStore)
    if (!sourceId) continue

    const catalogItem = await itemCatalogStore.get(sourceId)
    const tracksStock = item.track_stock ?? !!catalogItem?.track_stock
    let primaryBatchId = null
    let batchStoreName = null

    if (tracksStock) {
      primaryBatchId = await deductStockWithNegativeFallback({
        batchStore: itemBatchesStore,
        indexName: 'item_id',
        foreignKey: 'item_id',
        foreignId: sourceId,
        quantity: Number(item.qty || 0),
        now,
        autoBatchPrefix: 'AUTO-NEG-ITEM'
      })
      batchStoreName = 'item_batches'
    }

    await saleItemsStore.add({
      sale_id: saleId,
      medicine_id: null,
      item_id: sourceId,
      quantity: item.qty,
      price_at_sale: item.price,
      price_type: item.priceType,
      batch_id: primaryBatchId,
      batch_store: batchStoreName,
      is_piece_or_box: 'piece'
    })

    if (catalogItem) {
      catalogItem.last_sold_at = now
      catalogItem.updated_at = now
      await itemCatalogStore.put(catalogItem)
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
      const range = buildDateKeyRange(startDate, endDate)

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
      const tx = db.transaction(['sale_items', 'items'])
      const itemsStore = tx.objectStore('sale_items')
      const itemCatalogStore = tx.objectStore('items')

      const items = await collectFromSource(itemsStore.index('sale_id'), { query: saleId })

      for (const item of items) {
        await attachCatalogDetails(item, itemCatalogStore)
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

  const invTx = db.transaction(['item_batches'], 'readwrite')
  const itemBatchStore = invTx.objectStore('item_batches')

  for (const item of items) {
    if (!item.batch_id) continue
    const batch = await itemBatchStore.get(item.batch_id)
    if (batch) {
      batch.quantity += Number(item.quantity || 0)
      await itemBatchStore.put(batch)
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
    async exportSalesByDateRange(_, { startDate, endDate }) {
      const db = await dbPromise

      const tx = db.transaction(
        ['sales', 'sale_items', 'items', 'customers'],
        'readonly'
      )

      const salesStore = tx.objectStore('sales')
      const itemsStore = tx.objectStore('sale_items')
      const itemCatalogStore = tx.objectStore('items')
      const custStore = tx.objectStore('customers')

      const rows = []
      let totalSales = 0
      let transactionCount = 0

      let cursor = await salesStore.openCursor()
      while (cursor) {
        const sale = cursor.value
        const saleDate = new Date(sale.purchased_date)

        if (isWithinLocalDateRange(saleDate, startDate, endDate)) {
          transactionCount++
          totalSales += Number(sale.final_total || 0)

          const customer =
            sale.customer_id
              ? await custStore.get(sale.customer_id)
              : null

          const itemsIndex = itemsStore.index('sale_id')
          let itemCursor = await itemsIndex.openCursor(sale.id)

          const itemNames = []

          while (itemCursor) {
            const item = itemCursor.value
            const source = await resolveCatalogItem(item, itemCatalogStore)

            itemNames.push(source?.name || item.display_name || item.medicine_name || '')

            itemCursor = await itemCursor.continue()
          }

          rows.push({
            sale_id: sale.id,
            purchased_date: sale.purchased_date,
            status: sale.status,
            customer_name: customer ? customer.name : '',
            items: itemNames.join(', '),
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

async function deductStockWithNegativeFallback({ batchStore, indexName, foreignKey, foreignId, quantity, now, autoBatchPrefix }) {
  const allBatches = await collectFromSource(batchStore.index(indexName), { query: foreignId })
  const remainingQty = Number(quantity || 0)

  const sufficientBatch = allBatches.find(batch => Number(batch.quantity || 0) >= remainingQty)
  if (sufficientBatch) {
    sufficientBatch.quantity = Number(sufficientBatch.quantity || 0) - remainingQty
    await batchStore.put(sufficientBatch)
    return sufficientBatch.id
  }

  if (allBatches.length > 0) {
    const firstBatch = allBatches[0]
    firstBatch.quantity = Number(firstBatch.quantity || 0) - remainingQty
    await batchStore.put(firstBatch)
    return firstBatch.id
  }

  return batchStore.add({
    [foreignKey]: foreignId,
    quantity: -remainingQty,
    batch_number: `${autoBatchPrefix}-${Date.now()}`,
    expiry_date: null,
    cost_price: 0,
    added_date: now,
    created_at: now
  })
}

async function attachCatalogDetails(item, itemCatalogStore) {
  const source = await resolveCatalogItem(item, itemCatalogStore)
  const sourceType = 'item'
  const displayName = source?.name || 'Unknown'
  const secondaryName = source?.description || ''

  item.source_type = sourceType
  item.display_name = displayName
  item.secondary_name = secondaryName
  item.medicine_name = displayName
  item.generic_name = secondaryName
}

async function resolveCatalogItemId(item, itemCatalogStore) {
  const directId = Number(item.sourceId ?? item.item_id ?? item.id)
  if (Number.isFinite(directId)) {
    const directItem = await itemCatalogStore.get(directId)
    if (directItem) {
      return directId
    }
  }

  const legacyMedicineId = Number(item.medicine_id ?? item.sourceId)
  if (!Number.isFinite(legacyMedicineId)) {
    return null
  }

  const legacyIndex = itemCatalogStore.index('legacy_medicine_id')
  const migratedItem = await legacyIndex.get(legacyMedicineId)
  return migratedItem?.id || null
}

async function resolveCatalogItem(item, itemCatalogStore) {
  const itemId = await resolveCatalogItemId(item, itemCatalogStore)
  if (!itemId) {
    return null
  }

  return itemCatalogStore.get(itemId)
}
