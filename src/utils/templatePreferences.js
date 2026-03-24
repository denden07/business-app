import { dbPromise } from '../db'
import { createPageVisibilityMapFromTemplate } from '../templates/pages'
import {
  DEFAULT_TEMPLATE_ID,
  getResolvedTemplateDefinition,
  getTemplateDefinition,
} from '../templates/registry'

export const activeTemplateIdKey = 'active-template-id'
export const activeTemplateOverridesKey = 'active-template-overrides'

function normalizeTemplateId(value) {
  return getTemplateDefinition(value)?.id || DEFAULT_TEMPLATE_ID
}

function normalizeTemplateOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

export async function ensureTemplateSettings() {
  const db = await dbPromise
  const row = await db.get('app_settings', activeTemplateIdKey)
  const templateId = normalizeTemplateId(row?.value)

  if (row?.value !== templateId) {
    await db.put('app_settings', { key: activeTemplateIdKey, value: templateId })
  }

  return getTemplateDefinition(templateId)
}

export async function loadActiveTemplateId() {
  const template = await ensureTemplateSettings()
  return template.id
}

export async function loadResolvedActiveTemplate() {
  const db = await dbPromise
  const template = await ensureTemplateSettings()
  const overridesRow = await db.get('app_settings', activeTemplateOverridesKey)
  const overrides = normalizeTemplateOverrides(overridesRow?.value)
  return getResolvedTemplateDefinition(template.id, overrides)
}

export async function saveActiveTemplateId(templateId) {
  const normalizedTemplateId = normalizeTemplateId(templateId)
  const db = await dbPromise

  await db.put('app_settings', {
    key: activeTemplateIdKey,
    value: normalizedTemplateId,
  })

  return getTemplateDefinition(normalizedTemplateId)
}

export async function loadActiveTemplateOverrides() {
  const db = await dbPromise
  const row = await db.get('app_settings', activeTemplateOverridesKey)
  return normalizeTemplateOverrides(row?.value)
}

export async function saveActiveTemplateOverrides(overrides) {
  const normalizedOverrides = normalizeTemplateOverrides(overrides)
  const db = await dbPromise

  await db.put('app_settings', {
    key: activeTemplateOverridesKey,
    value: normalizedOverrides,
  })

  return normalizedOverrides
}

export async function saveActiveTemplateSelection(templateId, overrides = {}) {
  const normalizedTemplateId = normalizeTemplateId(templateId)
  const normalizedOverrides = normalizeTemplateOverrides(overrides)
  const db = await dbPromise

  await db.put('app_settings', {
    key: activeTemplateIdKey,
    value: normalizedTemplateId,
  })

  await db.put('app_settings', {
    key: activeTemplateOverridesKey,
    value: normalizedOverrides,
  })

  return getResolvedTemplateDefinition(normalizedTemplateId, normalizedOverrides)
}

export async function loadEffectivePageVisibility() {
  const db = await dbPromise
  const template = await ensureTemplateSettings()
  const map = createPageVisibilityMapFromTemplate(template)
  const store = db.transaction('pages').objectStore('pages')
  let hasStoredRows = false
  let cursor = await store.openCursor()

  while (cursor) {
    hasStoredRows = true
    const row = cursor.value
    if (Object.hasOwn(map, row.name)) {
      map[row.name] = !!row.visible
    }
    cursor = await cursor.continue()
  }

  return {
    map,
    hasStoredRows,
    template,
  }
}

export async function seedPageVisibilityFromTemplate(template, { force = false } = {}) {
  const db = await dbPromise
  const defaults = createPageVisibilityMapFromTemplate(template)
  const tx = db.transaction('pages', 'readwrite')
  const store = tx.objectStore('pages')
  const existingRows = new Set()
  let cursor = await store.openCursor()

  while (cursor) {
    existingRows.add(cursor.value.name)
    cursor = await cursor.continue()
  }

  for (const [name, visible] of Object.entries(defaults)) {
    if (force || !existingRows.has(name)) {
      await store.put({ name, visible })
    }
  }

  await tx.done

  return defaults
}

export async function initializeTemplatePreferences() {
  const template = await loadResolvedActiveTemplate()
  await seedPageVisibilityFromTemplate(template)
  return template
}