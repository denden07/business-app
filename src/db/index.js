import { openDB } from 'idb';

export const DB_NAME = 'pharmacy_pos_db';
export const DB_VERSION = 24;

export const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion, newVersion, transaction) {
    console.log(`📦 Upgrading DB from version ${oldVersion} → ${newVersion}`);

    /* =========================
       MEDICINES
    ========================== */
    if (!db.objectStoreNames.contains('medicines')) {
      const store = db.createObjectStore('medicines', { keyPath: 'id', autoIncrement: true });
      store.createIndex('name', 'name');
      store.createIndex('generic_name', 'generic_name');
      store.createIndex('price1', 'price1');
      store.createIndex('price2', 'price2');
      store.createIndex('last_sold_at', 'last_sold_at');
      store.createIndex('updated_at', 'updated_at');
    } else if (oldVersion < 13) {
      const store = transaction.objectStore('medicines');
      if (!store.indexNames.contains('last_sold_at')) {
        store.createIndex('last_sold_at', 'last_sold_at');
      }
    } else if (oldVersion < 14) {
      const store = transaction.objectStore('medicines');
      if (!store.indexNames.contains('updated_at')) {
        store.createIndex('updated_at', 'updated_at');
      }
    }

    /* =========================
       ITEMS
    ========================== */
    if (!db.objectStoreNames.contains('items')) {
      const store = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
      store.createIndex('name', 'name');
      store.createIndex('item_type', 'item_type');
      store.createIndex('track_stock', 'track_stock');
      store.createIndex('updated_at', 'updated_at');
      store.createIndex('last_sold_at', 'last_sold_at');
      store.createIndex('created_at', 'created_at');
      store.createIndex('legacy_medicine_id', 'legacy_medicine_id');
    } else {
      const store = transaction.objectStore('items');
      if (!store.indexNames.contains('legacy_medicine_id')) {
        store.createIndex('legacy_medicine_id', 'legacy_medicine_id');
      }
    }

    /* =========================
       ITEM BATCHES
    ========================== */
    if (!db.objectStoreNames.contains('item_batches')) {
      const store = db.createObjectStore('item_batches', { keyPath: 'id', autoIncrement: true });
      store.createIndex('item_id', 'item_id');
      store.createIndex('expiry_date', 'expiry_date');
    }

    /* =========================
       INVENTORY BATCHES
    ========================== */
    if (!db.objectStoreNames.contains('inventory_batches')) {
      const store = db.createObjectStore('inventory_batches', { keyPath: 'id', autoIncrement: true });
      store.createIndex('medicine_id', 'medicine_id');
      store.createIndex('expiry_date', 'expiry_date');
    }

    /* =========================
       PRICE HISTORY
    ========================== */
    if (!db.objectStoreNames.contains('price_history')) {
      const store = db.createObjectStore('price_history', { keyPath: 'id', autoIncrement: true });
      store.createIndex('medicine_id', 'medicine_id');
      store.createIndex('changed_at', 'changed_at');
    }

    /* =========================
       ITEM PRICE HISTORY
    ========================== */
    if (!db.objectStoreNames.contains('item_price_history')) {
      const store = db.createObjectStore('item_price_history', { keyPath: 'id', autoIncrement: true });
      store.createIndex('item_id', 'item_id');
      store.createIndex('changed_at', 'changed_at');
    }

    /* =========================
       CUSTOMERS
    ========================== */
    if (!db.objectStoreNames.contains('customers')) {
      const store = db.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
      store.createIndex('name', 'name');
      store.createIndex('id_number', 'id_number');
      store.createIndex('is_senior', 'is_senior');
      store.createIndex('address', 'address');
    }else if (oldVersion < 12) {
      const store = transaction.objectStore('customers');
      if (!store.indexNames.contains('created_at')) store.createIndex('created_at', 'created_at');
      if (!store.indexNames.contains('points')) store.createIndex('points', 'points');
    }

    /* =========================
       SALES
    ========================== */
    if (!db.objectStoreNames.contains('sales')) {
      const store = db.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
      store.createIndex('date', 'date');
      store.createIndex('customer_id', 'customer_id');
      store.createIndex('customer_purchased_date', ['customer_id', 'purchased_date']);
      store.createIndex('total_amount', 'total_amount');
      store.createIndex('final_total', 'final_total');
      store.createIndex('professional_fee', 'professional_fee');
      store.createIndex('discount', 'discount');
      store.createIndex('money_given', 'money_given');
      store.createIndex('change', 'change');
      store.createIndex('purchased_date', 'purchased_date')
      // 🔹 NEW
      store.createIndex('points_used', 'points_used');
      store.createIndex('points_discount', 'points_discount');
      store.createIndex('payment_status', 'payment_status');
      store.createIndex('outstanding_balance', 'outstanding_balance');
    } else {
      const store = transaction.objectStore('sales');
      if (oldVersion < 12) {
        if (!store.indexNames.contains('professional_fee')) store.createIndex('professional_fee', 'professional_fee');
        if (!store.indexNames.contains('discount')) store.createIndex('discount', 'discount');
        if (!store.indexNames.contains('money_given')) store.createIndex('money_given', 'money_given');
        if (!store.indexNames.contains('change')) store.createIndex('change', 'change');

        // 🔹 NEW SAFE INDEX ADD
        if (!store.indexNames.contains('points_used')) store.createIndex('points_used', 'points_used');
        if (!store.indexNames.contains('points_discount')) store.createIndex('points_discount', 'points_discount');
        if (!store.indexNames.contains('purchased_date')) {
          store.createIndex('purchased_date', 'purchased_date')
        }
      }
      if (oldVersion < 18 && !store.indexNames.contains('customer_purchased_date')) {
        store.createIndex('customer_purchased_date', ['customer_id', 'purchased_date'])
      }
      if (oldVersion < 23) {
        if (!store.indexNames.contains('payment_status')) {
          store.createIndex('payment_status', 'payment_status')
        }
        if (!store.indexNames.contains('outstanding_balance')) {
          store.createIndex('outstanding_balance', 'outstanding_balance')
        }
      }
    }

    /* =========================
       SALE ITEMS
    ========================== */
    if (!db.objectStoreNames.contains('sale_items')) {
      const store = db.createObjectStore('sale_items', { keyPath: 'id', autoIncrement: true });
      store.createIndex('sale_id', 'sale_id');
      store.createIndex('medicine_id', 'medicine_id');
      store.createIndex('item_id', 'item_id');
      store.createIndex('batch_id', 'batch_id');
      store.createIndex('quantity', 'quantity');
      store.createIndex('price_at_sale', 'price_at_sale');
      store.createIndex('price_type', 'price_type');
      store.createIndex('is_piece_or_box', 'is_piece_or_box');
    } 
    else {
      const store = transaction.objectStore('sale_items');
      if (oldVersion < 12) {
        if (!store.indexNames.contains('sale_id')) store.createIndex('sale_id', 'sale_id');
        if (!store.indexNames.contains('medicine_id')) store.createIndex('medicine_id', 'medicine_id');
        if (!store.indexNames.contains('batch_id')) store.createIndex('batch_id', 'batch_id');
        if (!store.indexNames.contains('quantity')) store.createIndex('quantity', 'quantity');
        if (!store.indexNames.contains('price_at_sale')) store.createIndex('price_at_sale', 'price_at_sale');
        if (!store.indexNames.contains('price_type')) store.createIndex('price_type', 'price_type');
        if (!store.indexNames.contains('is_piece_or_box')) store.createIndex('is_piece_or_box', 'is_piece_or_box');
      }
      if (oldVersion < 20 && !store.indexNames.contains('item_id')) {
        store.createIndex('item_id', 'item_id');
      }
    }

    /* =========================
       POINTS HISTORY
    ========================== */
    if (!db.objectStoreNames.contains('points_history')) {
      const store = db.createObjectStore('points_history', { keyPath: 'id', autoIncrement: true });
      store.createIndex('customer_id', 'customer_id');
      store.createIndex('customer_date', ['customer_id', 'date']);
      store.createIndex('date', 'date');
      store.createIndex('type', 'type');
      store.createIndex('related_sale_id', 'related_sale_id');
    } else {
      const store = transaction.objectStore('points_history');
      if (oldVersion < 12 && !store.indexNames.contains('related_sale_id')) {
        store.createIndex('related_sale_id', 'related_sale_id');
      }
      if (oldVersion < 18 && !store.indexNames.contains('customer_date')) {
        store.createIndex('customer_date', ['customer_id', 'date']);
      }
    }

    /* =========================
       YEARLY POINTS
    ========================== */
    if (!db.objectStoreNames.contains('yearly_points')) {
      db.createObjectStore('yearly_points', { keyPath: ['customer_id', 'year'] });
    }

    /* =========================
       DEBT PAYMENTS
    ========================== */
    if (!db.objectStoreNames.contains('debt_payments')) {
      const store = db.createObjectStore('debt_payments', { keyPath: 'id', autoIncrement: true });
      store.createIndex('sale_id', 'sale_id');
      store.createIndex('customer_id', 'customer_id');
      store.createIndex('customer_date', ['customer_id', 'paid_at']);
      store.createIndex('paid_at', 'paid_at');
    } else if (oldVersion < 24) {
      const store = transaction.objectStore('debt_payments');
      if (!store.indexNames.contains('sale_id')) store.createIndex('sale_id', 'sale_id');
      if (!store.indexNames.contains('customer_id')) store.createIndex('customer_id', 'customer_id');
      if (!store.indexNames.contains('customer_date')) store.createIndex('customer_date', ['customer_id', 'paid_at']);
      if (!store.indexNames.contains('paid_at')) store.createIndex('paid_at', 'paid_at');
    }

    /* =========================
       APP PAGES (visibility settings)
    ========================== */
    if (!db.objectStoreNames.contains('pages')) {
      const store = db.createObjectStore('pages', { keyPath: 'name' });
      // store documents like { name: 'Analytics', visible: true }
      store.createIndex('visible', 'visible');
    } else if (oldVersion < 15) {
      const store = transaction.objectStore('pages');
      if (!store.indexNames.contains('visible')) {
        store.createIndex('visible', 'visible');
      }
    }

    /* =========================
       APP SETTINGS (key-value store)
    ========================== */
    if (!db.objectStoreNames.contains('app_settings')) {
      db.createObjectStore('app_settings', { keyPath: 'key' })
      // stores documents like { key: 'settings-pin', value: '1234' }
    }

    /* =========================
       DRAFT SALES
    ========================== */
    if (!db.objectStoreNames.contains('draft_sales')) {
      const store = db.createObjectStore('draft_sales', { keyPath: 'id', autoIncrement: true });
      store.createIndex('created_at', 'created_at');
    }
  }
}).then(async db => {
  await migrateLegacyMedicinesToItems(db)
  return db
});

async function migrateLegacyMedicinesToItems(db) {
  const migrationKey = 'legacy-medicines-migrated-to-items-v1'
  const migrationState = await db.get('app_settings', migrationKey)
  if (migrationState?.value) {
    return
  }

  const tx = db.transaction(
    [
      'app_settings',
      'pages',
      'medicines',
      'inventory_batches',
      'price_history',
      'items',
      'item_batches',
      'item_price_history',
      'sale_items',
      'draft_sales'
    ],
    'readwrite'
  )

  const now = new Date().toISOString()
  const pagesStore = tx.objectStore('pages')
  const medicinesStore = tx.objectStore('medicines')
  const inventoryBatchesStore = tx.objectStore('inventory_batches')
  const priceHistoryStore = tx.objectStore('price_history')
  const itemsStore = tx.objectStore('items')
  const itemBatchesStore = tx.objectStore('item_batches')
  const itemPriceHistoryStore = tx.objectStore('item_price_history')
  const saleItemsStore = tx.objectStore('sale_items')
  const draftSalesStore = tx.objectStore('draft_sales')
  const appSettingsStore = tx.objectStore('app_settings')

  const [
    medicines,
    inventoryBatches,
    priceHistoryRows,
    existingItems,
    saleItems,
    drafts,
    pages,
  ] = await Promise.all([
    medicinesStore.getAll(),
    inventoryBatchesStore.getAll(),
    priceHistoryStore.getAll(),
    itemsStore.getAll(),
    saleItemsStore.getAll(),
    draftSalesStore.getAll(),
    pagesStore.getAll(),
  ])

  const pageVisibility = pages.find(page => page.name === 'Medicines')
  if (pageVisibility) {
    await pagesStore.put({ name: 'Items', visible: !!pageVisibility.visible })
    await pagesStore.delete('Medicines')
  }

  if (!medicines.length) {
    await appSettingsStore.put({ key: migrationKey, value: true, migrated_at: now })
    await tx.done
    return
  }

  const existingItemsByLegacyMedicineId = new Map(
    existingItems
      .filter(item => item.legacy_medicine_id !== undefined && item.legacy_medicine_id !== null)
      .map(item => [Number(item.legacy_medicine_id), item])
  )

  const medIdToItemId = new Map()
  for (const medicine of medicines) {
    const legacyMedicineId = Number(medicine.id)
    const existingItem = existingItemsByLegacyMedicineId.get(legacyMedicineId)
    const hasExpiry = inventoryBatches.some(batch =>
      Number(batch.medicine_id) === legacyMedicineId && !!batch.expiry_date
    )

    const itemRecord = {
      name: medicine.name,
      description: medicine.generic_name || '',
      item_type: 'product',
      price1: Number(medicine.price1 || 0),
      price2: Number(medicine.price2 || 0),
      track_stock: true,
      track_batches: true,
      track_expiry: hasExpiry,
      is_archived: !!medicine.is_archived,
      legacy_medicine_id: legacyMedicineId,
      created_at: medicine.created_at || now,
      updated_at: medicine.updated_at || medicine.created_at || now,
      last_sold_at: medicine.last_sold_at || null,
    }

    let itemId = existingItem?.id
    if (itemId) {
      await itemsStore.put({
        ...existingItem,
        ...itemRecord,
        id: existingItem.id,
      })
    } else {
      itemId = await itemsStore.add(itemRecord)
    }

    medIdToItemId.set(legacyMedicineId, Number(itemId))
  }

  const migratedBatchIdByLegacyBatchId = new Map()
  for (const batch of inventoryBatches) {
    const itemId = medIdToItemId.get(Number(batch.medicine_id))
    if (!itemId) continue

    const migratedBatchId = await itemBatchesStore.add({
      item_id: itemId,
      quantity: Number(batch.quantity || 0),
      expiry_date: batch.expiry_date || null,
      batch_number: batch.batch_number || `LEGACY-${batch.id}`,
      cost_price: Number(batch.cost_price || 0),
      reason: batch.reason || 'LEGACY-MIGRATION',
      added_date: batch.added_date || batch.created_at || now,
      created_at: batch.created_at || batch.added_date || now,
    })

    migratedBatchIdByLegacyBatchId.set(Number(batch.id), Number(migratedBatchId))
  }

  for (const row of priceHistoryRows) {
    const itemId = medIdToItemId.get(Number(row.medicine_id))
    if (!itemId) continue

    await itemPriceHistoryStore.add({
      item_id: itemId,
      price1: Number(row.price1 ?? row.new_price1 ?? row.old_price1 ?? 0),
      price2: Number(row.price2 ?? row.new_price2 ?? row.old_price2 ?? 0),
      changed_at: row.changed_at || now,
    })
  }

  for (const row of saleItems) {
    if (!row.medicine_id || row.item_id) continue

    const itemId = medIdToItemId.get(Number(row.medicine_id))
    if (!itemId) continue

    await saleItemsStore.put({
      ...row,
      item_id: itemId,
      medicine_id: null,
      batch_store: row.batch_id ? 'item_batches' : null,
      batch_id: row.batch_id ? (migratedBatchIdByLegacyBatchId.get(Number(row.batch_id)) || null) : null,
    })
  }

  for (const draft of drafts) {
    const migratedCatalogMap = {}

    for (const entry of Object.values(draft.catalogMap || {})) {
      const normalizedEntry = buildMigratedDraftCatalogEntry(entry, medIdToItemId)
      if (normalizedEntry) {
        migratedCatalogMap[normalizedEntry.cartKey] = normalizedEntry
      }
    }

    for (const entry of Object.values(draft.medicinesMap || {})) {
      const normalizedEntry = buildMigratedDraftCatalogEntry(entry, medIdToItemId)
      if (normalizedEntry) {
        migratedCatalogMap[normalizedEntry.cartKey] = normalizedEntry
      }
    }

    await draftSalesStore.put({
      ...draft,
      cart: (draft.cart || [])
        .map(entry => buildMigratedDraftCartEntry(entry, medIdToItemId))
        .filter(Boolean),
      catalogMap: migratedCatalogMap,
      medicinesMap: {},
    })
  }

  await appSettingsStore.put({ key: migrationKey, value: true, migrated_at: now })
  await tx.done
}

function buildMigratedDraftCatalogEntry(entry, medIdToItemId) {
  const isLegacyMedicine = entry?.sourceType === 'medicine' || entry?.medicine_id || entry?.legacy_medicine_id || entry?.generic_name
  const itemId = isLegacyMedicine
    ? medIdToItemId.get(Number(entry.sourceId ?? entry.medicine_id ?? entry.id))
    : Number(entry.sourceId ?? entry.item_id ?? entry.id)

  if (!Number.isFinite(itemId)) {
    return null
  }

  return {
    ...entry,
    sourceType: 'item',
    sourceId: itemId,
    item_id: itemId,
    medicine_id: null,
    cartKey: `item:${itemId}`,
    description: entry.description || entry.generic_name || '',
    generic_name: '',
    item_type: entry.item_type || 'product',
    track_stock: entry.track_stock === false ? false : true,
  }
}

function buildMigratedDraftCartEntry(entry, medIdToItemId) {
  const isLegacyMedicine = entry?.sourceType === 'medicine' || entry?.medicine_id
  const itemId = isLegacyMedicine
    ? medIdToItemId.get(Number(entry.sourceId ?? entry.medicine_id ?? entry.id))
    : Number(entry.sourceId ?? entry.item_id ?? entry.id)

  if (!Number.isFinite(itemId)) {
    return null
  }

  return {
    ...entry,
    id: itemId,
    sourceId: itemId,
    sourceType: 'item',
    cartKey: `item:${itemId}`,
    item_id: itemId,
    medicine_id: null,
    description: entry.description || entry.generic_name || '',
    generic_name: '',
    item_type: entry.item_type || 'product',
    track_stock: entry.track_stock === false ? false : true,
  }
}
