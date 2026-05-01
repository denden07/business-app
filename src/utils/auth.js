import { dbPromise } from '../db'
import Swal from 'sweetalert2'
import {
  configurablePageDefinitions,
  getPinProtectionPageNameForRouteName,
} from '../templates/pages'

const AUTH_SETTINGS_KEY = 'auth-config-v1'
const AUTH_SESSION_KEY = 'auth-session-v1'
const AUTH_LOGIN_REDIRECT_CONTEXT_KEY = 'auth-login-redirect-context-v1'
const SETTINGS_PIN_KEY = 'settings-pin'
const PIN_PROTECTED_PAGES_KEY = 'pin-protected-pages-v1'
export const AUTH_IDLE_TIMEOUT_MS = 15 * 60 * 1000

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

function sanitizeUsername(value) {
  return String(value || '').trim()
}

function normalizeConfig(value = null) {
  const username = sanitizeUsername(value?.username)

  return {
    enabled: value?.enabled === true,
    username,
    normalizedUsername: normalizeUsername(username),
    passwordHash: String(value?.passwordHash || ''),
    updatedAt: String(value?.updatedAt || ''),
  }
}

function normalizeSession(value = null) {
  const username = sanitizeUsername(value?.username)

  if (!username) {
    return null
  }

  return {
    username,
    normalizedUsername: normalizeUsername(username),
    loggedInAt: String(value?.loggedInAt || ''),
    lastActiveAt: String(value?.lastActiveAt || value?.loggedInAt || ''),
  }
}

function getSessionStorage() {
  return window.sessionStorage
}

function normalizeRedirectContext(value = null) {
  const reason = String(value?.reason || '').trim()
  const redirect = String(value?.redirect || '').trim()
  const expiresAt = Number(value?.expiresAt || 0)

  if (!reason || !redirect || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null
  }

  return {
    reason,
    redirect,
    expiresAt,
  }
}

function getSessionTimestamp(value) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function buildDefaultPinProtectedPages() {
  return configurablePageDefinitions.reduce((map, page) => {
    map[page.name] = page.name === 'Analytics'
    return map
  }, {})
}

function normalizePinProtectedPages(value = null) {
  const defaults = buildDefaultPinProtectedPages()

  for (const page of configurablePageDefinitions) {
    if (typeof value?.[page.name] === 'boolean') {
      defaults[page.name] = value[page.name]
    }
  }

  return defaults
}

function digestToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashPassword(password) {
  const payload = new TextEncoder().encode(String(password || ''))
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return digestToHex(digest)
}

export async function loadAuthConfig() {
  try {
    const db = await dbPromise
    const row = await db.get('app_settings', AUTH_SETTINGS_KEY)
    return normalizeConfig(row?.value)
  } catch {
    return normalizeConfig()
  }
}

export async function saveAuthConfig({ username, password }) {
  const sanitizedUsername = sanitizeUsername(username)
  const trimmedPassword = String(password || '')

  if (!sanitizedUsername) {
    throw new Error('Username is required.')
  }

  if (trimmedPassword.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  const value = {
    enabled: true,
    username: sanitizedUsername,
    passwordHash: await hashPassword(trimmedPassword),
    updatedAt: new Date().toISOString(),
  }

  const db = await dbPromise
  await db.put('app_settings', { key: AUTH_SETTINGS_KEY, value })

  return normalizeConfig(value)
}

export async function clearAuthConfig() {
  const db = await dbPromise
  await db.delete('app_settings', AUTH_SETTINGS_KEY)
}

export async function loadSettingsPin() {
  try {
    const db = await dbPromise
    const row = await db.get('app_settings', SETTINGS_PIN_KEY)
    return row?.value ? String(row.value) : null
  } catch {
    return null
  }
}

export async function verifySettingsPin(pin) {
  const storedPin = await loadSettingsPin()

  if (!storedPin) {
    return false
  }

  return String(pin || '') === storedPin
}

export function setPendingAuthLoginRedirectContext({ reason = 'expired', redirect = '/' } = {}) {
  const payload = {
    reason: String(reason || 'expired').trim() || 'expired',
    redirect: String(redirect || '/').trim() || '/',
    expiresAt: Date.now() + 2 * 60 * 1000,
  }

  getSessionStorage().setItem(AUTH_LOGIN_REDIRECT_CONTEXT_KEY, JSON.stringify(payload))
  return payload
}

export function consumePendingAuthLoginRedirectContext() {
  try {
    const storage = getSessionStorage()
    const payload = normalizeRedirectContext(JSON.parse(storage.getItem(AUTH_LOGIN_REDIRECT_CONTEXT_KEY) || 'null'))
    storage.removeItem(AUTH_LOGIN_REDIRECT_CONTEXT_KEY)
    return payload
  } catch {
    getSessionStorage().removeItem(AUTH_LOGIN_REDIRECT_CONTEXT_KEY)
    return null
  }
}

export async function loadPinProtectedPages() {
  try {
    const db = await dbPromise
    const row = await db.get('app_settings', PIN_PROTECTED_PAGES_KEY)
    return normalizePinProtectedPages(row?.value)
  } catch {
    return normalizePinProtectedPages()
  }
}

export async function savePinProtectedPages(value) {
  const normalized = normalizePinProtectedPages(value)
  const db = await dbPromise
  await db.put('app_settings', {
    key: PIN_PROTECTED_PAGES_KEY,
    value: normalized,
  })
  return normalized
}

export async function isPagePinProtected(routeName) {
  const pageName = getPinProtectionPageNameForRouteName(routeName)

  if (!pageName) {
    return false
  }

  const protectedPages = await loadPinProtectedPages()
  return protectedPages[pageName] === true
}

export async function promptForPinCode({
  title = 'Enter PIN',
  text = '',
  pinLength = 4,
  confirmButtonText = 'Unlock',
  cancelButtonText = 'Cancel',
  showConfirmButton = true,
} = {}) {
  const resolvedPinLength = Math.max(4, Math.min(Number(pinLength) || 4, 8))
  const inputMarkup = Array.from({ length: resolvedPinLength }, (_, index) => (
    `<input class="swal-pin-digit" data-index="${index}" type="password" inputmode="numeric" maxlength="1" autocomplete="one-time-code" />`
  )).join('')

  return Swal.fire({
    title,
    html: `
      <style>
        .swal-pin-copy {
          margin: 0 0 14px;
          color: #64748b;
          font-size: 14px;
          line-height: 1.45;
        }
        .swal-pin-row {
          display: grid;
          grid-template-columns: repeat(${resolvedPinLength}, minmax(0, 1fr));
          gap: 10px;
        }
        .swal-pin-digit {
          min-height: 52px;
          padding: 0;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.32);
          background: rgba(248, 250, 252, 0.96);
          color: #0f172a;
          font-size: 22px;
          font-weight: 800;
          text-align: center;
          box-sizing: border-box;
        }
        .swal-pin-digit:focus {
          outline: none;
          border-color: #1abc9c;
          box-shadow: 0 0 0 3px rgba(26, 188, 156, 0.18);
        }
      </style>
      ${text ? `<p class="swal-pin-copy">${text}</p>` : ''}
      <div class="swal-pin-row">${inputMarkup}</div>
    `,
    showCancelButton: true,
    showConfirmButton,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor: '#1abc9c',
    cancelButtonColor: '#888',
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: popup => {
      const inputs = Array.from(popup.querySelectorAll('.swal-pin-digit'))

      const focusInput = index => {
        const target = inputs[index]
        if (target) {
          target.focus()
          target.select?.()
        }
      }

      const getPin = () => inputs.map(input => input.value).join('')

      const trySubmit = () => {
        if (getPin().length === resolvedPinLength) {
          Swal.clickConfirm()
        }
      }

      inputs.forEach((input, index) => {
        input.addEventListener('input', event => {
          const nextValue = String(event.target.value || '').slice(-1)
          input.value = nextValue

          if (nextValue && index < inputs.length - 1) {
            focusInput(index + 1)
          }

          if (nextValue && index === inputs.length - 1) {
            trySubmit()
          }
        })

        input.addEventListener('keydown', event => {
          if (event.key === 'Backspace' && !input.value && index > 0) {
            inputs[index - 1].value = ''
            focusInput(index - 1)
            event.preventDefault()
            return
          }

          if (event.key === 'ArrowLeft' && index > 0) {
            focusInput(index - 1)
            event.preventDefault()
            return
          }

          if (event.key === 'ArrowRight' && index < inputs.length - 1) {
            focusInput(index + 1)
            event.preventDefault()
          }
        })

        input.addEventListener('paste', event => {
          const pasted = String(event.clipboardData?.getData('text') || '').slice(0, resolvedPinLength)
          if (!pasted) {
            return
          }

          event.preventDefault()

          inputs.forEach((field, fieldIndex) => {
            field.value = pasted[fieldIndex] || ''
          })

          const nextIndex = Math.min(Math.max(pasted.length - 1, 0), inputs.length - 1)
          focusInput(nextIndex)
          trySubmit()
        })
      })

      focusInput(0)
    },
    preConfirm: () => {
      const popup = Swal.getPopup()
      const value = Array.from(popup?.querySelectorAll('.swal-pin-digit') || [])
        .map(input => input.value)
        .join('')

      if (value.length < resolvedPinLength) {
        Swal.showValidationMessage('Enter your PIN.')
        return false
      }

      return value
    },
  })
}

export async function promptForSettingsPin(options = {}) {
  const storedPin = await loadSettingsPin()

  if (!storedPin) {
    return true
  }

  const result = await promptForPinCode({
    title: options.title || '🔒 Confirm PIN',
    text: options.text || 'Enter your PIN to continue.',
    pinLength: storedPin.length,
    confirmButtonText: options.confirmButtonText || 'Confirm',
    cancelButtonText: options.cancelButtonText || 'Cancel',
    showConfirmButton: false,
  })

  if (!result.isConfirmed) {
    return false
  }

  if (result.value === storedPin) {
    return true
  }

  await Swal.fire({
    icon: 'error',
    title: 'Incorrect PIN',
    timer: 1400,
    showConfirmButton: false,
  })
  return false
}

export function loadAuthSession() {
  try {
    return normalizeSession(JSON.parse(getSessionStorage().getItem(AUTH_SESSION_KEY) || 'null'))
  } catch {
    return null
  }
}

export function saveAuthSession(username) {
  const now = new Date().toISOString()
  const session = normalizeSession({
    username,
    loggedInAt: now,
    lastActiveAt: now,
  })

  if (!session) {
    clearAuthSession()
    return null
  }

  getSessionStorage().setItem(AUTH_SESSION_KEY, JSON.stringify(session))
  return session
}

export function touchAuthSession() {
  const session = loadAuthSession()

  if (!session) {
    return null
  }

  const nextSession = {
    ...session,
    lastActiveAt: new Date().toISOString(),
  }

  getSessionStorage().setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession))
  return nextSession
}

export function clearAuthSession() {
  getSessionStorage().removeItem(AUTH_SESSION_KEY)
}

export function isAuthSessionValid(config, session) {
  const lastActiveAt = getSessionTimestamp(session?.lastActiveAt)

  return Boolean(
    config?.enabled &&
    config?.passwordHash &&
    session?.normalizedUsername &&
    session.normalizedUsername === config.normalizedUsername &&
    lastActiveAt &&
    Date.now() - lastActiveAt <= AUTH_IDLE_TIMEOUT_MS
  )
}

export async function verifyAuthCredentials(username, password, config = null) {
  const activeConfig = normalizeConfig(config || await loadAuthConfig())

  if (!activeConfig.enabled || !activeConfig.passwordHash) {
    return false
  }

  if (normalizeUsername(username) !== activeConfig.normalizedUsername) {
    return false
  }

  const passwordHash = await hashPassword(password)
  return passwordHash === activeConfig.passwordHash
}