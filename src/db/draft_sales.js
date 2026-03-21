import { dbPromise } from './index'

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
  const all = await db.getAll('draft_sales')
  return all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

/** Delete a single draft by id. */
export async function deleteDraft(id) {
  const db = await dbPromise
  return db.delete('draft_sales', id)
}
