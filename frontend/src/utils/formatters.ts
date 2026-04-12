import type { ConnectorState } from '../types/sdn'

const numberFormatter = new Intl.NumberFormat('en-US')
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 'N/A'
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue)
    ? numberFormatter.format(numericValue)
    : String(value)
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'N/A'
  }

  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime())
    ? value
    : dateTimeFormatter.format(parsedDate)
}

export function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 'N/A'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'number') {
    return formatNumber(value)
  }

  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

export function formatLabel(value: string) {
  return value
    .replace(/[-_:]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function classifyNode(nodeId: string) {
  if (nodeId.startsWith('openflow:')) {
    return 'Switch'
  }

  if (nodeId.startsWith('host:')) {
    return 'Host'
  }

  return 'Node'
}

export function formatConnectorState(state?: ConnectorState) {
  if (!state) {
    return 'Unavailable'
  }

  const flags: string[] = []

  if (state.live) {
    flags.push('Live')
  }

  if (state.blocked) {
    flags.push('Blocked')
  }

  if (state['link-down']) {
    flags.push('Link down')
  }

  return flags.length > 0 ? flags.join(' / ') : 'Idle'
}

export function formatPacketPair(
  received: string | undefined,
  transmitted: string | undefined,
) {
  return `RX ${formatNumber(received ?? 0)} / TX ${formatNumber(
    transmitted ?? 0,
  )}`
}

export function formatBytePair(
  received: string | undefined,
  transmitted: string | undefined,
) {
  return `RX ${formatNumber(received ?? 0)} / TX ${formatNumber(
    transmitted ?? 0,
  )}`
}

export function summarizeRecord(record?: Record<string, unknown>) {
  if (!record || Object.keys(record).length === 0) {
    return 'None'
  }

  return Object.entries(record)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(' · ')
}

export function formatDuration(
  seconds: number | undefined,
  nanoseconds: number | undefined,
) {
  if (seconds === undefined && nanoseconds === undefined) {
    return 'N/A'
  }

  const milliseconds = Math.round((nanoseconds ?? 0) / 1_000_000)
  return `${formatNumber(seconds ?? 0)}s ${milliseconds}ms`
}
