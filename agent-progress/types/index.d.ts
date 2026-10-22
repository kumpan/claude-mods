export type Flow = {
  title: string
  total: number
  done: number
  isFinished: boolean
  steps: string[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-progress': {
      flow: Flow | null
      agents: AgentRun[]
      isDoneCollapsed: boolean
      now: number
    }
  }
}
