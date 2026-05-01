import {
  DEFAULT_TEMPLATE_ID,
  getResolvedTemplateDefinition,
  listTemplates,
} from '../templates/registry'
import {
  initializeTemplatePreferences,
  saveActiveTemplateSelection,
  seedPageVisibilityFromTemplate,
} from '../utils/templatePreferences'
import { syncFormattingPreferencesFromTemplate } from '../utils/formattingPreferences'

export default {
  namespaced: true,

  state: () => ({
    activeTemplateId: DEFAULT_TEMPLATE_ID,
    activeTemplateOverrides: {},
    ready: false,
  }),

  getters: {
    activeTemplate: state => getResolvedTemplateDefinition(state.activeTemplateId, state.activeTemplateOverrides),
    availableTemplates: () => listTemplates(),
    itemDefaults: (state, getters) => getters.activeTemplate.itemDefaults,
    pageDefaults: (state, getters) => getters.activeTemplate.defaultPageVisibility,
    reportingFocus: (state, getters) => getters.activeTemplate.reporting?.focus || 'mixed',
  },

  mutations: {
    SET_ACTIVE_TEMPLATE_ID(state, templateId) {
      state.activeTemplateId = templateId
    },
    SET_ACTIVE_TEMPLATE_OVERRIDES(state, overrides) {
      state.activeTemplateOverrides = overrides || {}
    },
    SET_READY(state, value) {
      state.ready = value
    },
  },

  actions: {
    async initializeTemplate({ commit }) {
      const template = await initializeTemplatePreferences()
      syncFormattingPreferencesFromTemplate(template)
      commit('SET_ACTIVE_TEMPLATE_ID', template.id)
      commit('SET_ACTIVE_TEMPLATE_OVERRIDES', {
        capabilities: template.capabilities,
        workflow: template.workflow,
        itemDefaults: template.itemDefaults,
        customer: template.customer,
        payments: template.payments,
        pages: template.pages,
        reporting: template.reporting,
        formatting: template.formatting,
        labels: template.labels,
      })
      commit('SET_READY', true)
      return template
    },

    async setActiveTemplate({ commit }, { templateId, overrides = {}, forcePageVisibility = false } = {}) {
      const template = await saveActiveTemplateSelection(templateId, overrides)
      await seedPageVisibilityFromTemplate(template, { force: forcePageVisibility })
      syncFormattingPreferencesFromTemplate(template)
      commit('SET_ACTIVE_TEMPLATE_ID', template.id)
      commit('SET_ACTIVE_TEMPLATE_OVERRIDES', {
        capabilities: template.capabilities,
        workflow: template.workflow,
        itemDefaults: template.itemDefaults,
        customer: template.customer,
        payments: template.payments,
        pages: template.pages,
        reporting: template.reporting,
        formatting: template.formatting,
        labels: template.labels,
      })
      commit('SET_READY', true)
      return template
    },
  },
}