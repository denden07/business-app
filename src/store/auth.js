import {
  clearAuthConfig,
  clearAuthSession,
  isAuthSessionValid,
  loadAuthConfig,
  loadAuthSession,
  loadSettingsPin,
  saveAuthConfig,
  saveAuthSession,
  touchAuthSession,
  verifyAuthCredentials,
  verifySettingsPin,
} from '../utils/auth'

function buildAuthState(config, session) {
  const authenticated = isAuthSessionValid(config, session)

  if (!authenticated) {
    clearAuthSession()
  }

  return {
    initialized: true,
    enabled: config.enabled,
    authenticated,
    username: config.username || '',
    loggedInAt: authenticated ? session.loggedInAt : '',
    lastActiveAt: authenticated ? session.lastActiveAt : '',
  }
}

export default {
  namespaced: true,

  state: () => ({
    initialized: false,
    enabled: false,
    authenticated: false,
    username: '',
    loggedInAt: '',
    lastActiveAt: '',
  }),

  getters: {
    isEnabled: state => state.enabled,
    isAuthenticated: state => state.authenticated,
  },

  mutations: {
    SET_AUTH_STATE(state, payload) {
      state.initialized = payload.initialized
      state.enabled = payload.enabled
      state.authenticated = payload.authenticated
      state.username = payload.username
      state.loggedInAt = payload.loggedInAt
      state.lastActiveAt = payload.lastActiveAt
    },
  },

  actions: {
    async initialize({ state, dispatch }) {
      if (state.initialized) {
        return state
      }

      return dispatch('refresh')
    },

    async refresh({ commit }) {
      const config = await loadAuthConfig()
      const session = loadAuthSession()
      const nextState = buildAuthState(config, session)
      commit('SET_AUTH_STATE', nextState)
      return nextState
    },

    async login({ commit }, { username, password }) {
      const config = await loadAuthConfig()
      const isValid = await verifyAuthCredentials(username, password, config)

      if (!isValid) {
        throw new Error('Invalid username or password.')
      }

      const session = saveAuthSession(config.username)
      const nextState = buildAuthState(config, session)
      commit('SET_AUTH_STATE', nextState)
      return nextState
    },

    async unlock({ commit }, { method = 'password', username, password, pin } = {}) {
      const config = await loadAuthConfig()

      if (!config.enabled) {
        throw new Error('Login protection is not enabled.')
      }

      if (method === 'pin') {
        const hasPin = await loadSettingsPin()

        if (!hasPin) {
          throw new Error('No PIN is configured. Use your password instead.')
        }

        const isPinValid = await verifySettingsPin(pin)

        if (!isPinValid) {
          throw new Error('Invalid PIN.')
        }
      } else {
        const isPasswordValid = await verifyAuthCredentials(username, password, config)

        if (!isPasswordValid) {
          throw new Error('Invalid username or password.')
        }
      }

      const session = saveAuthSession(config.username)
      const nextState = buildAuthState(config, session)
      commit('SET_AUTH_STATE', nextState)
      return nextState
    },

    async logout({ dispatch }) {
      clearAuthSession()
      return dispatch('refresh')
    },

    async configure({ commit }, { username, password }) {
      const config = await saveAuthConfig({ username, password })
      clearAuthSession()
      const nextState = buildAuthState(config, null)
      commit('SET_AUTH_STATE', nextState)
      return nextState
    },

    async recordActivity({ state, dispatch }) {
      if (!state.enabled) {
        return state
      }

      const nextState = await dispatch('refresh')

      if (!nextState.authenticated) {
        return nextState
      }

      touchAuthSession()
      return dispatch('refresh')
    },

    async disable({ commit }) {
      await clearAuthConfig()
      clearAuthSession()
      commit('SET_AUTH_STATE', {
        initialized: true,
        enabled: false,
        authenticated: false,
        username: '',
        loggedInAt: '',
        lastActiveAt: '',
      })
    },
  },
}