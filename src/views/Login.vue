<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { dbPromise } from '../db'
import { loadSettingsPin } from '../utils/auth'

const router = useRouter()
const route = useRoute()
const store = useStore()

const appName = ref('Business Companion')
const username = ref('')
const password = ref('')
const pinDigits = ref([])
const errorMessage = ref('')
const isSubmitting = ref(false)
const backgroundImage = ref('')
const hasSettingsPin = ref(false)
const loginMethod = ref('password')
const pinLength = ref(4)
const pinInputRefs = ref([])

const loginBackgroundOptions = Object.freeze([
  'https://images.unsplash.com/photo-1504439468489-c8920d796a29?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1600&q=80',
])

const redirectTarget = computed(() => {
  const redirect = route.query.redirect
  return typeof redirect === 'string' && redirect && redirect !== '/login' ? redirect : '/'
})

const sessionExpired = computed(() => route.query.reason === 'expired')

const loginTitle = computed(() => sessionExpired.value ? 'Welcome Back' : appName.value)

const loginSubtitle = computed(() => {
  if (!sessionExpired.value) {
    return 'Sign in to continue using the app on this device.'
  }

  if (hasSettingsPin.value) {
    return 'For security, access was paused. Unlock with your PIN, or switch to your current password.'
  }

  return 'For security, access was paused. Sign in with your current password to continue.'
})

const showMethodSwitch = computed(() => sessionExpired.value && hasSettingsPin.value)
const pinValue = computed(() => pinDigits.value.join(''))

const submitLabel = computed(() => {
  if (isSubmitting.value) {
    return loginMethod.value === 'pin' ? 'Unlocking...' : 'Signing in...'
  }

  return loginMethod.value === 'pin' ? 'Unlock With PIN' : 'Sign In With Password'
})

const pageBackgroundStyle = computed(() => ({
  '--login-background-image': backgroundImage.value ? `url("${backgroundImage.value}")` : 'none',
}))

function resetPinDigits() {
  pinDigits.value = Array.from({ length: pinLength.value }, () => '')
}

function setPinInputRef(element, index) {
  if (!element) {
    return
  }

  pinInputRefs.value[index] = element
}

function focusPinInput(index) {
  nextTick(() => {
    const target = pinInputRefs.value[index]

    if (target) {
      target.focus()
      target.select?.()
    }
  })
}

function shouldAutoSubmitPin() {
  return loginMethod.value === 'pin' && !isSubmitting.value && pinValue.value.length === pinLength.value
}

function triggerAutoSubmitPin() {
  if (!shouldAutoSubmitPin()) {
    return
  }

  handleLogin()
}

function switchLoginMethod(method) {
  loginMethod.value = method
  errorMessage.value = ''

  if (method === 'pin') {
    resetPinDigits()
    focusPinInput(0)
  }
}

function handlePinInput(index, event) {
  const rawValue = String(event.target.value || '')
  const nextChar = rawValue.slice(-1)
  pinDigits.value[index] = nextChar

  if (nextChar && index < pinLength.value - 1) {
    focusPinInput(index + 1)
  } else if (nextChar) {
    triggerAutoSubmitPin()
  }
}

function handlePinKeydown(index, event) {
  if (event.key === 'Backspace' && !pinDigits.value[index] && index > 0) {
    pinDigits.value[index - 1] = ''
    focusPinInput(index - 1)
    event.preventDefault()
    return
  }

  if (event.key === 'ArrowLeft' && index > 0) {
    focusPinInput(index - 1)
    event.preventDefault()
    return
  }

  if (event.key === 'ArrowRight' && index < pinLength.value - 1) {
    focusPinInput(index + 1)
    event.preventDefault()
  }
}

function handlePinPaste(event) {
  const pasted = String(event.clipboardData?.getData('text') || '').slice(0, pinLength.value)

  if (!pasted) {
    return
  }

  event.preventDefault()

  const nextDigits = Array.from({ length: pinLength.value }, (_, index) => pasted[index] || '')
  pinDigits.value = nextDigits

  const nextIndex = Math.min(Math.max(pasted.length - 1, 0), pinLength.value - 1)
  focusPinInput(nextIndex)
  triggerAutoSubmitPin()
}

async function loadAppName() {
  try {
    const db = await dbPromise
    const row = await db.get('app_settings', 'app-name')
    appName.value = row?.value?.trim() || 'Business Companion'
  } catch {
    appName.value = 'Business Companion'
  }
}

async function handleLogin() {
  errorMessage.value = ''

  if (loginMethod.value === 'pin') {
    if (!pinValue.value.trim() || pinValue.value.length < pinLength.value) {
      errorMessage.value = 'Enter your PIN.'
      return
    }
  } else if (!username.value.trim() || !password.value) {
    errorMessage.value = 'Enter your username and password.'
    return
  }

  isSubmitting.value = true

  try {
    await store.dispatch(
      sessionExpired.value ? 'auth/unlock' : 'auth/login',
      loginMethod.value === 'pin'
        ? { method: 'pin', pin: pinValue.value }
        : { method: 'password', username: username.value, password: password.value }
    )
    await router.replace(redirectTarget.value)
  } catch (error) {
    errorMessage.value = error.message || 'Unable to sign in.'
  } finally {
    isSubmitting.value = false
    password.value = ''
    resetPinDigits()
  }
}

onMounted(async () => {
  backgroundImage.value = loginBackgroundOptions[Math.floor(Math.random() * loginBackgroundOptions.length)]
  await loadAppName()
  await store.dispatch('auth/initialize')
  username.value = store.state.auth.username || ''
  const storedPin = await loadSettingsPin()
  hasSettingsPin.value = Boolean(storedPin)
  pinLength.value = Math.max(4, Math.min(String(storedPin || '').length || 4, 8))
  resetPinDigits()
  loginMethod.value = sessionExpired.value && hasSettingsPin.value ? 'pin' : 'password'

  if (loginMethod.value === 'pin') {
    focusPinInput(0)
  }
})
</script>

<template>
  <div class="login-page" :style="pageBackgroundStyle">
    <div class="login-backdrop"></div>
    <div class="login-shell">
      <section class="login-card">
        <div class="login-copy">
          <p class="login-eyebrow">{{ sessionExpired ? 'Access Paused' : 'Local Access' }}</p>
          <h1>{{ loginTitle }}</h1>
          <p class="muted">{{ loginSubtitle }}</p>
        </div>

        <div v-if="showMethodSwitch" class="login-method-switch">
          <button
            type="button"
            class="login-method-btn"
            :class="{ active: loginMethod === 'pin' }"
            @click="switchLoginMethod('pin')"
          >
            Use PIN
          </button>
          <button
            type="button"
            class="login-method-btn"
            :class="{ active: loginMethod === 'password' }"
            @click="switchLoginMethod('password')"
          >
            Use Password
          </button>
        </div>

        <form class="login-form" @submit.prevent="handleLogin">
          <label v-if="loginMethod !== 'pin'">
            <span>Username</span>
            <input v-model="username" class="input" type="text" autocomplete="username" placeholder="Enter username" />
          </label>

          <label v-if="loginMethod !== 'pin'">
            <span>Password</span>
            <input v-model="password" class="input" type="password" autocomplete="current-password" placeholder="Enter password" />
          </label>

          <label v-else>
            <span>PIN</span>
            <div class="pin-input-row" @paste="handlePinPaste">
              <input
                v-for="(digit, index) in pinDigits"
                :key="index"
                :ref="element => setPinInputRef(element, index)"
                :value="digit"
                class="pin-digit-input"
                type="password"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="1"
                @input="handlePinInput(index, $event)"
                @keydown="handlePinKeydown(index, $event)"
              />
            </div>
          </label>

          <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>

          <button v-if="loginMethod !== 'pin'" class="primary login-submit" type="submit" :disabled="isSubmitting">
            {{ submitLabel }}
          </button>
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
  background:
    linear-gradient(160deg, #dff6f0 0%, #dce8ff 52%, #f9fbff 100%);
}

.login-backdrop {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(135deg, rgba(15, 23, 42, 0.52), rgba(15, 23, 42, 0.18)),
    var(--login-background-image);
  background-size: cover;
  background-position: center;
  transform: scale(1.04);
}

.login-page::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top left, rgba(26, 188, 156, 0.26), transparent 28%),
    radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.2), transparent 24%);
}

.login-shell {
  position: relative;
  z-index: 1;
  width: min(100%, 440px);
}

.login-card {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 251, 253, 0.88) 100%);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
}

.login-copy {
  margin-bottom: 20px;
}

.login-eyebrow {
  margin: 0 0 8px;
  color: #0f8f78;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.login-copy h1 {
  margin: 0;
  font-size: clamp(28px, 5vw, 36px);
  line-height: 1.05;
}

.login-copy .muted {
  margin: 10px 0 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-method-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.login-method-btn {
  min-height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.56);
  color: #334155;
  box-shadow: none;
}

.login-method-btn.active {
  background: #0f8f78;
  border-color: #0f8f78;
  color: #f8fafc;
}

.login-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.pin-input-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  gap: 10px;
}

.pin-digit-input {
  min-height: 54px;
  padding: 0;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(255, 255, 255, 0.74);
  color: #0f172a;
  font-size: 22px;
  font-weight: 800;
  text-align: center;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.pin-digit-input:focus {
  outline: none;
  border-color: #1abc9c;
  box-shadow: 0 0 0 3px rgba(26, 188, 156, 0.18), 0 10px 24px rgba(15, 23, 42, 0.12);
}

.login-submit {
  width: 100%;
  margin-top: 6px;
}

.login-error {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
  font-weight: 600;
}

body.dark-mode .login-page {
  background: linear-gradient(180deg, #15202a 0%, #101821 100%);
}

body.dark-mode .login-card {
  background: linear-gradient(180deg, rgba(39, 48, 58, 0.84) 0%, rgba(30, 38, 47, 0.86) 100%);
  border-color: rgba(119, 139, 160, 0.4);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.36);
}

body.dark-mode .login-form label,
body.dark-mode .login-copy h1 {
  color: #f8fafc;
}

body.dark-mode .pin-digit-input {
  background: rgba(51, 62, 74, 0.82);
  border-color: rgba(119, 139, 160, 0.34);
  color: #f8fafc;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
}

body.dark-mode .pin-digit-input:focus {
  border-color: #1abc9c;
  box-shadow: 0 0 0 3px rgba(26, 188, 156, 0.2), 0 10px 24px rgba(0, 0, 0, 0.24);
}

body.dark-mode .login-method-btn {
  background: rgba(51, 62, 74, 0.74);
  border-color: rgba(119, 139, 160, 0.34);
  color: #e2e8f0;
}

body.dark-mode .login-method-btn.active {
  background: #1abc9c;
  border-color: #1abc9c;
  color: #f8fafc;
}

body.dark-mode .login-copy .muted {
  color: #cbd5e1;
}

body.dark-mode .login-error {
  color: #fca5a5;
}
</style>