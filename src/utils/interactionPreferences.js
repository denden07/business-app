import { dbPromise } from '../db'

export const interactionSettingsKey = 'interaction-feedback'

export const defaultInteractionSettings = {
  soundEnabled: true,
  vibrationEnabled: true,
}

export function normalizeInteractionSettings(value) {
  return {
    soundEnabled: value?.soundEnabled !== false,
    vibrationEnabled: value?.vibrationEnabled !== false,
  }
}

export async function loadInteractionSettings() {
  const db = await dbPromise
  const row = await db.get('app_settings', interactionSettingsKey)
  return normalizeInteractionSettings(row?.value)
}

export async function saveInteractionSettings(value) {
  const normalized = normalizeInteractionSettings(value)
  const db = await dbPromise

  await db.put('app_settings', {
    key: interactionSettingsKey,
    value: normalized,
  })

  return normalized
}