import type { Annotation } from '../types'
import { useSettings } from './useSettings'

const { settings } = useSettings()

interface McpSession {
  id: string
  created: number
}

const SESSION_STORAGE_KEY = 'agentation-vue-mcp-session'

function getStoredSession(): McpSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as McpSession
  } catch {
    return null
  }
}

function storeSession(session: McpSession) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {}
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {}
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response | null> {
  const url = settings.mcpUrl
  if (!url) return null

  try {
    const resp = await fetch(`${url.replace(/\/$/, '')}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    return resp
  } catch {
    return null
  }
}

async function ensureSession(): Promise<string | null> {
  const stored = getStoredSession()
  if (stored) return stored.id

  const resp = await apiFetch('/sessions', { method: 'POST' })
  if (!resp || !resp.ok) return null

  try {
    const body = await resp.json()
    const session: McpSession = { id: body.id, created: Date.now() }
    storeSession(session)
    return session.id
  } catch {
    return null
  }
}

function canSend(): boolean {
  return !!settings.mcpUrl && settings.autoSendMcp
}

function toMcpAnnotation(ann: Annotation) {
  return {
    id: ann.id,
    comment: ann.comment,
    element: ann.element,
    elementPath: ann.elementPath,
    kind: 'feedback' as const,
    intent: 'fix' as const,
    severity: 'suggestion' as const,
    timestamp: ann.timestamp,
    url: ann.url,
    x: ann.x,
    y: ann.y,
    selectedText: ann.selectedText,
    boundingBox: ann.boundingBox,
    cssClasses: ann.cssClasses,
    computedStyles: ann.computedStyles,
    accessibility: ann.accessibility,
    vueComponents: ann.vueComponents,
  }
}

// Auto-send (gated by autoSendMcp setting)
export async function mcpSyncAnnotation(annotation: Annotation): Promise<void> {
  if (!canSend()) return

  const sessionId = await ensureSession()
  if (!sessionId) return

  await apiFetch(`/sessions/${sessionId}/annotations`, {
    method: 'POST',
    body: JSON.stringify(toMcpAnnotation(annotation)),
  })
}

export async function mcpUpdateAnnotation(id: string, annotation: Annotation): Promise<void> {
  if (!canSend()) return

  await apiFetch(`/annotations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(toMcpAnnotation(annotation)),
  })
}

export async function mcpDeleteAnnotation(id: string): Promise<void> {
  if (!canSend()) return

  await apiFetch(`/annotations/${id}`, { method: 'DELETE' })
}

export async function mcpClearAnnotations(): Promise<void> {
  clearSession()
}

// Manual send (ignores autoSendMcp — user explicitly clicked "Send to Agent")
export async function sendAllToMcp(annotations: Annotation[]): Promise<void> {
  if (!settings.mcpUrl) return

  const sessionId = await ensureSession()
  if (!sessionId) return

  for (const ann of annotations) {
    await apiFetch(`/sessions/${sessionId}/annotations`, {
      method: 'POST',
      body: JSON.stringify(toMcpAnnotation(ann)),
    })
  }
}

export function isMcpConfigured(): boolean {
  return !!settings.mcpUrl
}

export function useMcpClient() {
  return {
    mcpSyncAnnotation,
    mcpUpdateAnnotation,
    mcpDeleteAnnotation,
    mcpClearAnnotations,
    sendAllToMcp,
    isMcpConfigured,
  }
}
