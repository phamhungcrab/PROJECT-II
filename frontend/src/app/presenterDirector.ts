export const presenterRefreshEventName = 'sdn-presenter-refresh-request'
export const presenterHotkeyLabel = 'Alt+P'

export function requestPresenterRefresh() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(presenterRefreshEventName))
}
