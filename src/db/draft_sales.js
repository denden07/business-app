import { dbPromise } from './index'
import { collectFromSource } from './query'

/**
 * Save the current cart state as a draft (held sale).
 * @param {string} name       - Label entered by the user
 * @param {object} snapshot   - { cart, customer, professionalFee, pointsConfirmed,
 *                               redeemMultiplier, specialDiscount, paymentMethod }
 * @returns {number} id of the saved draft
 */
export async function saveDraft(name, snapshot) {
  const db = await dbPromise
  return db.add('draft_sales', {
    name: name || 'Draft',
    created_at: new Date().toISOString(),
    ...snapshot
  })
}

/** Return all drafts, newest first. */
export async function getDrafts() {
  const db = await dbPromise
  return collectFromSource(
    db.transaction('draft_sales').objectStore('draft_sales').index('created_at'),
    { direction: 'prev' }
  )
}

/** Delete a single draft by id. */
export async function deleteDraft(id) {
  const db = await dbPromise
  return db.delete('draft_sales', id)
}
