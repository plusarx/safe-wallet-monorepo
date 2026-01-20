import { useState, useCallback, useEffect } from 'react'
import { BrowserProvider, Contract } from 'ethers'
import { useDelegationModule } from '../useDelegationModule'
import { TOKENS_BY_CHAIN, TRADING_MODULE_ADDRESSES } from '../../contracts/TradingModule'

export interface ClientInfo {
  address: string
  permissions: number
  isActive: boolean
  selected: boolean
  walletType: 'eoa' | 'safe'
  approvals?: string[]
}

export function useManagerClients(walletAddress: string) {
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const { getManagerClients, getDelegation } = useDelegationModule()

  const loadClients = useCallback(async () => {
    if (!walletAddress || !window.ethereum) return

    setIsLoading(true)
    setError(null)

    try {
      const provider = new BrowserProvider(window.ethereum as any)
      const clientAddresses = await getManagerClients(walletAddress)
      const clientList: ClientInfo[] = []

      const network = await provider.getNetwork()
      const chainId = Number(network.chainId)
      const tradingModule = TRADING_MODULE_ADDRESSES[chainId]
      const tokens = TOKENS_BY_CHAIN[chainId]

      // TODO: Parallelize this for better performance
      for (const addr of clientAddresses) {
        const delegation = await getDelegation(addr, walletAddress)
        if (delegation) {
          const code = await provider.getCode(addr)
          const walletType = code && code !== '0x' ? 'safe' : 'eoa'

          // Check approvals
          const approvals: string[] = []
          if (tradingModule && tokens) {
            await Promise.all(
              Object.values(tokens).map(async (t) => {
                if (!t.address || t.address === '0na') return
                try {
                  const contract = new Contract(
                    t.address,
                    ['function allowance(address,address) view returns (uint256)'],
                    provider,
                  )
                  const allowance = await contract.allowance(addr, tradingModule)
                  if (allowance > 0n) approvals.push(t.symbol)
                } catch (e) {
                  // console.warn('Allowance check failed', t.symbol)
                }
              }),
            )
          }

          clientList.push({
            address: addr,
            permissions: delegation.permissions,
            isActive: delegation.isActive,
            selected: clientList.length === 0, // Select first by default
            walletType,
            approvals,
          })
        }
      }

      setClients(clientList)
    } catch (err: any) {
      console.error('Failed to load clients:', err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress, getManagerClients, getDelegation])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  const toggleClient = (address: string) => {
    setClients((prev) => prev.map((c) => (c.address === address ? { ...c, selected: !c.selected } : c)))
  }

  const toggleSelectAll = (filteredClients: ClientInfo[] = clients) => {
    const allSelected = filteredClients.every((c) => c.selected)
    const targetAddresses = new Set(filteredClients.map((c) => c.address))

    setClients((prev) => prev.map((c) => (targetAddresses.has(c.address) ? { ...c, selected: !allSelected } : c)))
  }

  const selectClient = (address: string) => {
    setClients((prev) => prev.map((c) => ({ ...c, selected: c.address === address })))
  }

  return { clients, isLoading, error, refresh: loadClients, toggleClient, toggleSelectAll, selectClient }
}
