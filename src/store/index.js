import { createStore } from 'vuex'
import items from './items'
import sales from './sales'
import customers from './customer'
import transaction from './transaction'
import drafts from './drafts'
import template from './template'

export default createStore({
  modules: {
    transaction,
    customers,
    items,
    sales,
    drafts,
    template
  }
})