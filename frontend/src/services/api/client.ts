import { appConfig } from '../../config/appConfig'

function buildUrl(path: string) {
  return `${appConfig.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

function extractErrorMessage(status: number, payload: unknown) {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return `Request failed (${status}): ${payload}`
  }

  if (payload && typeof payload === 'object') {
    const detail =
      'detail' in payload && typeof payload.detail === 'string'
        ? payload.detail
        : 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : null

    if (detail) {
      return `Request failed (${status}): ${detail}`
    }
  }

  return `Request failed with status ${status}.`
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')

  const response = await fetch(buildUrl(path), {
    ...init,
    cache: 'no-store',
    headers,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    throw new Error(extractErrorMessage(response.status, payload))
  }

  return payload as T
}
