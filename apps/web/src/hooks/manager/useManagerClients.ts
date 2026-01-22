import { useState, useCallback, useEffect } from 'react'
import { BrowserProvider, Contract, formatUnits } from 'ethers'
import { useDelegationModule } from '../useDelegationModule'
import { TOKENS_BY_CHAIN, TRADING_MODULE_ADDRESSES } from '../../contracts/TradingModule'

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)']

export interface ClientInfo {
  address: string
  permissions: number
  isActive: boolean
  selected: boolean
  walletType: 'eoa' | 'safe'
  approvals?: string[]
  usdcBalance?: string
  wethBalance?: string
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

      const network = await provider.getNetwork()
      const chainId = Number(network.chainId)
      const tradingModule = TRADING_MODULE_ADDRESSES[chainId]
      const tokens = TOKENS_BY_CHAIN[chainId]

      // Parallelize fetches
      const clientPromises = clientAddresses.map(async (addr) => {
        const delegation = await getDelegation(addr, walletAddress)
        if (!delegation) return null

        const code = await provider.getCode(addr)
        const walletType = code && code !== '0x' ? 'safe' : 'eoa'

        // Check approvals & Balances
        const approvals: string[] = []
        let usdcBalance = '0'
        let wethBalance = '0'

        if (tokens) {
          const promises: Promise<any>[] = []

          // Approvals
          if (tradingModule) {
            Object.values(tokens).forEach((t) => {
              if (!t.address || t.address === '0na') return
              const c = new Contract(
                t.address,
                ['function allowance(address,address) view returns (uint256)'],
                provider,
              )
              promises.push(
                c
                  .allowance(addr, tradingModule)
                  .then((allowance: bigint) => (allowance > 0n ? t.symbol : null))
                  .catch(() => null),
              )
            })
          }

          // Balances
          if (tokens.USDC?.address) {
            const c = new Contract(tokens.USDC.address, ERC20_ABI, provider)
            promises.push(
              c
                .balanceOf(addr)
                .then((b: bigint) => ({ type: 'USDC', val: formatUnits(b, tokens.USDC.decimals) }))
                .catch(() => ({ type: 'USDC', val: '0' })),
            )
          }
          if (tokens.WETH?.address) {
            const c = new Contract(tokens.WETH.address, ERC20_ABI, provider)
            promises.push(
              c
                .balanceOf(addr)
                .then((b: bigint) => ({ type: 'WETH', val: formatUnits(b, tokens.WETH.decimals) }))
                .catch(() => ({ type: 'WETH', val: '0' })),
            )
          }

          const results = await Promise.all(promises)

          results.forEach((res) => {
            if (typeof res === 'string') approvals.push(res)
            else if (res && res.type === 'USDC') usdcBalance = res.val
            else if (res && res.type === 'WETH') wethBalance = res.val
          })
        }

        return {
          address: addr,
          permissions: delegation.permissions,
          isActive: delegation.isActive,
          walletType: walletType as 'safe' | 'eoa',
          approvals,
          usdcBalance,
          wethBalance,
        }
      })

      const loadedClients = (await Promise.all(clientPromises)).filter(Boolean) as any[]

      // Preserve selection state if possible, else default to first
      setClients((prev) => {
        if (prev.length === 0) {
          return loadedClients.map((c, i) => ({ ...c, selected: i === 0 }))
        }
        const prevSelected = new Set(prev.filter((c) => c.selected).map((c) => c.address))
        return loadedClients.map((c) => ({ ...c, selected: prevSelected.has(c.address) }))
      })
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
