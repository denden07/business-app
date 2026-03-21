import { openDB } from 'idb';

export const DB_NAME = 'pharmacy_pos_db';
export const DB_VERSION = 15; // 🔼 bump version

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
    } 
    else if (oldVersion < 12) {
      const store = transaction.objectStore('sales');
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

    /* =========================
       SALE ITEMS
    ========================== */
    if (!db.objectStoreNames.contains('sale_items')) {
      const store = db.createObjectStore('sale_items', { keyPath: 'id', autoIncrement: true });
      store.createIndex('sale_id', 'sale_id');
      store.createIndex('medicine_id', 'medicine_id');
      store.createIndex('batch_id', 'batch_id');
      store.createIndex('quantity', 'quantity');
      store.createIndex('price_at_sale', 'price_at_sale');
      store.createIndex('price_type', 'price_type');
      store.createIndex('is_piece_or_box', 'is_piece_or_box');
    } 
    else if (oldVersion < 12) {
      const store = transaction.objectStore('sale_items');
      if (!store.indexNames.contains('sale_id')) store.createIndex('sale_id', 'sale_id');
      if (!store.indexNames.contains('medicine_id')) store.createIndex('medicine_id', 'medicine_id');
      if (!store.indexNames.contains('batch_id')) store.createIndex('batch_id', 'batch_id');
      if (!store.indexNames.contains('quantity')) store.createIndex('quantity', 'quantity');
      if (!store.indexNames.contains('price_at_sale')) store.createIndex('price_at_sale', 'price_at_sale');
      if (!store.indexNames.contains('price_type')) store.createIndex('price_type', 'price_type');
      if (!store.indexNames.contains('is_piece_or_box')) store.createIndex('is_piece_or_box', 'is_piece_or_box');
    }

    /* =========================
       POINTS HISTORY
    ========================== */
    if (!db.objectStoreNames.contains('points_history')) {
      const store = db.createObjectStore('points_history', { keyPath: 'id', autoIncrement: true });
      store.createIndex('customer_id', 'customer_id');
      store.createIndex('date', 'date');
      store.createIndex('type', 'type');
      store.createIndex('related_sale_id', 'related_sale_id');
    } 
    else if (oldVersion < 12) {
      const store = transaction.objectStore('points_history');
      if (!store.indexNames.contains('related_sale_id')) {
        store.createIndex('related_sale_id', 'related_sale_id');
      }
    }

    /* =========================
       YEARLY POINTS
    ========================== */
    if (!db.objectStoreNames.contains('yearly_points')) {
      db.createObjectStore('yearly_points', { keyPath: ['customer_id', 'year'] });
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
  }
});
