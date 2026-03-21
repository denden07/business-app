import { createStore } from 'vuex'
import medicines from './medicines'
import sales from './sales'
import customers from './customer'
import transaction from './transaction'
import drafts from './drafts'

export default createStore({
  modules: {
    transaction,
    customers,
    medicines,
    sales,
    drafts
  }
})