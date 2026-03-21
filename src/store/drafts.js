import { dbPromise } from '../db'

export default {
  namespaced: true,

  state: () => ({
    drafts: []
  }),

  mutations: {
    SET_DRAFTS(state, drafts) {
      state.drafts = drafts
    }
  },

  actions: {
    /** Load all drafts from IndexedDB, newest first. */
    async load({ commit }) {
      const db = await dbPromise
      const all = await db.getAll('draft_sales')
      const sorted = all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      commit('SET_DRAFTS', sorted)
    },

    /**
     * Save current cart state as a draft. Does NOT touch inventory.
     * @param {string} name       - Label for the draft
     * @param {object} snapshot   - { cart, medicinesMap, customer, professionalFee,
     *                               pointsConfirmed, redeemMultiplier, customerPoints,
     *                               specialDiscount, paymentMethod }
     */
    async save({ dispatch }, { name, snapshot }) {
      const db = await dbPromise
      await db.add('draft_sales', {
        name: name || 'Draft',
        created_at: new Date().toISOString(),
        ...snapshot
      })
      await dispatch('load')
    },

    /** Delete a draft by id and refresh the list. */
    async remove({ dispatch }, id) {
      const db = await dbPromise
      await db.delete('draft_sales', id)
      await dispatch('load')
    }
  }
}
