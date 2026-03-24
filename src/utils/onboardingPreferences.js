import { dbPromise } from '../db'

export const onboardingCompletedKey = 'setup-completed-v1'

export async function isOnboardingComplete() {
  const db = await dbPromise
  const row = await db.get('app_settings', onboardingCompletedKey)
  return row?.value === true
}

export async function setOnboardingComplete(value) {
  const db = await dbPromise

  await db.put('app_settings', {
    key: onboardingCompletedKey,
    value: value === true,
  })

  return value === true
}