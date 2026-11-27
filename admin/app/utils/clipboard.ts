/**
 * Copies text to the clipboard. The modern clipboard API only works on https
 * (or localhost); the server is opened over plain http, so fall back to the old
 * "select a hidden text box + copy" way there. Throws if neither works.
 */
export async function copyToClipboard(text: string) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      /* blocked: try the old way */
    }
  }
  const box = document.createElement('textarea')
  box.value = text
  box.setAttribute('readonly', '')
  box.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;'
  document.body.appendChild(box)
  const active = document.activeElement as HTMLElement | null
  box.select()
  box.setSelectionRange(0, text.length)
  let ok: boolean
  try {
    ok = document.execCommand('copy')
  } finally {
    box.remove()
    active?.focus?.()
  }
  if (!ok) throw new Error('Copy is not allowed in this browser')
}
