import type { NewSafeFormData } from '@/components/new-safe/create'
import type { RiskProfile } from '@/config/pulsarx'

export type NamedAddress = {
  name: string
  address: string
  ens?: string
}

export type PendingSafeTx = {
  data: string
  from: string
  nonce: number
  to: string
  value: bigint
  startBlock: number
}

export type PendingSafeData = NewSafeFormData & {
  txHash?: string
  tx?: PendingSafeTx
  taskId?: string
}

export type PendingSafeByChain = Record<string, PendingSafeData | undefined>

// PulsarX-specific types
export type PulsarXConfig = {
  selectedProtocols: string[]
  quantEnabled: boolean
  riskProfile: RiskProfile
  selectedStrategies: string[]
}
