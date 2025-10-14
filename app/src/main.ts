import { Store } from '@tauri-apps/plugin-store'
import { invoke } from '@tauri-apps/api/core'

const store = new Store('settings.json')

function setError(message: string) {
  const el = document.getElementById('error') as HTMLParagraphElement | null
  if (el) el.textContent = message
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

async function init() {
  const input = document.getElementById('serverUrl') as HTMLInputElement
  const form = document.getElementById('settings-form') as HTMLFormElement
  const changeBtn = document.getElementById('changeServer') as HTMLButtonElement

  const existing = (await store.get<string>('serverUrl')) || ''
  if (existing) {
    input.value = existing
    changeBtn.style.display = 'inline-block'
    // Try launching directly on load if a URL exists
    tryLaunch(existing)
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const url = input.value.trim()
    if (!isValidHttpsUrl(url)) {
      setError('Please enter a valid HTTPS URL (e.g., https://your-app.onrender.com).')
      return
    }
    await store.set('serverUrl', url)
    await store.save()
    setError('')
    await tryLaunch(url)
  })

  changeBtn.addEventListener('click', async () => {
    input.focus()
  })
}

async function tryLaunch(url: string) {
  try {
    // Quick reachability check
    await fetch(url, { method: 'HEAD', mode: 'no-cors' }).catch(() => {})
    await invoke('open_server_window', { url })
  } catch (e) {
    setError('Failed to open server window. Check the URL and network/TLS.')
  }
}

init()


