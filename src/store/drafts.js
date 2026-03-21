import { dbPromise } from '../db'

export default {
  namespaced: true,

  state: () => ({
    drafts: [],
    currentPage: 1,
    itemsPerPage: 10,
    totalCount: 0
  }),

  mutations: {
    SET_DRAFTS(state, drafts) {
      state.drafts = drafts
    },
    SET_CURRENT_PAGE(state, page) {
      state.currentPage = page
    },
    SET_ITEMS_PER_PAGE(state, perPage) {
      state.itemsPerPage = perPage
    },
    SET_TOTAL_COUNT(state, total) {
      state.totalCount = total
    }
  },

  actions: {
    /** Load a paged slice of drafts from IndexedDB, newest first. */
    async loadPage({ commit, state }, { page = state.currentPage, perPage = state.itemsPerPage } = {}) {
      const db = await dbPromise
      const index = db.transaction('draft_sales').objectStore('draft_sales').index('created_at')
      const total = await index.count()
      const offset = (page - 1) * perPage
      const drafts = []
      let skipped = 0
      let cursor = await index.openCursor(null, 'prev')

      while (cursor) {
        if (skipped < offset) {
          skipped += 1
          cursor = await cursor.continue()
          continue
        }

        drafts.push(cursor.value)
        if (drafts.length >= perPage) {
          break
        }
        cursor = await cursor.continue()
      }

      commit('SET_CURRENT_PAGE', page)
      commit('SET_ITEMS_PER_PAGE', perPage)
      commit('SET_TOTAL_COUNT', total)
      commit('SET_DRAFTS', drafts)
    },

    async load({ dispatch, state }, payload = {}) {
      return dispatch('loadPage', {
        page: payload.page ?? state.currentPage,
        perPage: payload.perPage ?? state.itemsPerPage
      })
    },

    async getDraftById(_, id) {
      const db = await dbPromise
      return db.get('draft_sales', id)
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
      await dispatch('loadPage', { page: 1 })
    },

    /** Delete a draft by id and refresh the list. */
    async remove({ dispatch, state }, id) {
      const db = await dbPromise
      await db.delete('draft_sales', id)
      const nextTotal = Math.max(0, state.totalCount - 1)
      const totalPages = Math.max(1, Math.ceil(nextTotal / state.itemsPerPage))
      const targetPage = Math.min(state.currentPage, totalPages)
      await dispatch('loadPage', { page: targetPage, perPage: state.itemsPerPage })
    }
  }
}
