import { useState, useEffect, useCallback } from 'react'
import { BrowserProvider, Contract, formatUnits } from 'ethers'
import { useDelegationModule } from '../useDelegationModule'
import { TRADING_MODULE_ADDRESSES, TOKENS_BY_CHAIN } from '../../contracts/TradingModule'
import useWallet from '@/hooks/wallets/useWallet'

// Treasury address for fee detection (used to count trades)
const TREASURY_ADDRESS = '0x9FFc3Ad75A809EAAF2115140d81F34Fcf190feCb'

// Platform fee: 10 bps = 0.1%
const PLATFORM_FEE_BPS = 10

// Minimal ERC20 ABI
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]

export interface ClientInfo {
  address: string
  walletType: 'safe' | 'eoa'
  usdcBalance: string
  wethBalance: string
  totalValue: number // USD value
}

export interface ExecutionRecord {
  txHash: string
  timestamp: Date
  type: 'swap' | 'batch'
  tokenIn: string
  tokenOut: string
  amountIn: string
  feeAmount: string
  safe: string
  status: 'success' | 'pending' | 'failed'
  blockNumber: number
}

export interface AssetOverview {
  symbol: string
  balance: number
  value: number // USD
  holders: ClientInfo[] // List of clients holding this asset
}

export interface SummaryData {
  totalClients: number
  safeClients: number
  eoaClients: number
  totalTrades: number
  totalVolumeUSD: number
  totalAUM: number
  unrealizedPnL: number
  realizedPnL: number
  portfolio: AssetOverview[]
}

export const useManagerStats = () => {
  const wallet = useWallet()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [executions, setExecutions] = useState<ExecutionRecord[]>([])
  const [summary, setSummary] = useState<SummaryData>({
    totalClients: 0,
    safeClients: 0,
    eoaClients: 0,
    totalTrades: 0,
    totalVolumeUSD: 0,
    totalAUM: 0,
    unrealizedPnL: 0,
    realizedPnL: 0,
    portfolio: [],
  })

  const { getManagerClients, getDelegation } = useDelegationModule()

  const loadData = useCallback(async () => {
    if (!wallet?.address || !wallet?.provider) return

    setIsLoading(true)
    setError(null)

    try {
      const provider = new BrowserProvider(wallet.provider)
      const managerAddress = wallet.address

      const network = await provider.getNetwork()
      const chainId = Number(network.chainId)
      const tradingModule = TRADING_MODULE_ADDRESSES[chainId]
      const tokens = TOKENS_BY_CHAIN[chainId]

      if (!tokens) {
        // If unsupported chain, allow partial data or show error
        // But preventing crash is better.
        // setError(`Chain ${chainId} not supported`)
      }

      // Get client addresses
      const ClientsResult = await getManagerClients(managerAddress)
      const clientAddresses = Array.from(ClientsResult)

      const ethPriceUSD = 3300 // Approximate price - TODO: Fetch real price

      const assetMap: Record<string, AssetOverview> = {
        USDC: { symbol: 'USDC', balance: 0, value: 0, holders: [] },
        WETH: { symbol: 'WETH', balance: 0, value: 0, holders: [] },
      }

      // --- 1. Fetch Client Details ---
      const clientPromises = clientAddresses.map(async (addr) => {
        try {
          const delegation = await getDelegation(addr, managerAddress)
          if (!delegation?.isActive) return null

          const code = await provider.getCode(addr)
          const walletType: 'safe' | 'eoa' = code && code !== '0x' ? 'safe' : 'eoa'

          let usdcBalance = '0'
          let wethBalance = '0'
          let clientValue = 0

          try {
            if (tokens) {
              const balancePromises: Promise<any>[] = []

              if (tokens.USDC?.address) {
                const usdcContract = new Contract(tokens.USDC.address, ERC20_ABI, provider)
                balancePromises.push(usdcContract.balanceOf(addr))
              } else {
                balancePromises.push(Promise.resolve(0n))
              }

              if (tokens.WETH?.address) {
                const wethContract = new Contract(tokens.WETH.address, ERC20_ABI, provider)
                balancePromises.push(wethContract.balanceOf(addr))
              } else {
                balancePromises.push(Promise.resolve(0n))
              }

              const [usdcBal, wethBal] = await Promise.all(balancePromises)

              if (tokens.USDC) {
                usdcBalance = formatUnits(usdcBal, tokens.USDC.decimals)
                clientValue += parseFloat(usdcBalance)
              }
              if (tokens.WETH) {
                wethBalance = formatUnits(wethBal, tokens.WETH.decimals)
                clientValue += parseFloat(wethBalance) * ethPriceUSD
              }
            }
          } catch (err) {
            console.warn('Failed to get balances for', addr)
          }

          const clientInfo: ClientInfo = {
            address: addr,
            walletType,
            usdcBalance,
            wethBalance,
            totalValue: clientValue,
          }
          return clientInfo
        } catch (err) {
          return null
        }
      })

      const clientResults = await Promise.all(clientPromises)
      const clientList: ClientInfo[] = []
      let safeCount = 0
      let eoaCount = 0
      let totalAUM = 0

      for (const client of clientResults) {
        if (!client) continue
        clientList.push(client)
        totalAUM += client.totalValue
        if (client.walletType === 'safe') safeCount++
        else eoaCount++

        // Aggregate Assets
        const usdc = parseFloat(client.usdcBalance)
        if (usdc > 0.01) {
          assetMap.USDC.balance += usdc
          assetMap.USDC.value += usdc
          assetMap.USDC.holders.push(client)
        }

        const weth = parseFloat(client.wethBalance)
        if (weth > 0.000001) {
          assetMap.WETH.balance += weth
          assetMap.WETH.value += weth * ethPriceUSD
          assetMap.WETH.holders.push(client)
        }
      }
      setClients(clientList)

      // --- 2. Fetch Executions & Calculate Volume ---
      let totalTrades = 0
      let totalVolumeUSD = 0
      const executionRecords: ExecutionRecord[] = []

      if (tokens && tradingModule) {
        const currentBlock = await provider.getBlockNumber()
        const isArbitrum = chainId === 42161
        const lookback = isArbitrum ? 2_000_000 : 500_000
        const fromBlock = Math.max(0, currentBlock - lookback)

        const tokenPrices: Record<string, number> = {
          USDC: 1,
          USDT: 1,
          WETH: ethPriceUSD,
        }

        const queryPromises: Promise<{
          symbol: string
          decimals: number
          events: any[]
          client: string
        }>[] = []

        for (const [symbol, token] of Object.entries(tokens)) {
          if (!token.address || token.address === '0na') continue
          const tokenContract = new Contract(token.address, ERC20_ABI, provider)

          for (const client of clientAddresses) {
            queryPromises.push(
              tokenContract
                .queryFilter(tokenContract.filters.Transfer(client, TREASURY_ADDRESS), fromBlock, 'latest')
                .then((events) => ({ symbol, decimals: token.decimals, events, client }))
                .catch(() => ({ symbol, decimals: token.decimals, events: [], client })),
            )
          }
        }

        const results = await Promise.all(queryPromises)

        const eventsToProcess: { event: any; symbol: string; decimals: number; client: string }[] = []
        for (const result of results) {
          for (const event of result.events) {
            eventsToProcess.push({
              event,
              symbol: result.symbol,
              decimals: result.decimals,
              client: result.client,
            })
          }
        }

        const batchSize = 10
        for (let i = 0; i < eventsToProcess.length; i += batchSize) {
          const batch = eventsToProcess.slice(i, i + batchSize)
          const [receipts, blocks] = await Promise.all([
            Promise.all(batch.map((item) => item.event.getTransactionReceipt().catch(() => null))),
            Promise.all(batch.map((item) => item.event.getBlock().catch(() => null))),
          ])

          for (let j = 0; j < batch.length; j++) {
            const { event, symbol, decimals, client } = batch[j]
            const receipt = receipts[j]
            const block = blocks[j]

            if (!receipt || receipt.to?.toLowerCase() !== tradingModule.toLowerCase()) continue
            if (!block) continue // Need block for timestamp

            const log = event as any
            const feeAmount = log.args?.[2] || 0n
            const amountIn = (feeAmount * 10000n) / BigInt(PLATFORM_FEE_BPS)

            // Check uniqueness
            const existing = executionRecords.find(
              (e) => e.txHash === event.transactionHash && e.safe === client && e.tokenIn === symbol, // Simplified uniqueness check
            )
            if (existing) continue

            const tokenOut = symbol === 'USDC' ? 'WETH' : symbol === 'WETH' ? 'USDC' : 'USDC'

            // Check for batch
            const relatedEvents = eventsToProcess.filter((e) => e.event.transactionHash === event.transactionHash)
            const isBatch = relatedEvents.length > 1

            executionRecords.push({
              txHash: event.transactionHash,
              timestamp: new Date(block.timestamp * 1000),
              type: isBatch ? 'batch' : 'swap',
              tokenIn: symbol,
              tokenOut,
              amountIn: formatUnits(amountIn, decimals),
              feeAmount: formatUnits(feeAmount, decimals),
              safe: client,
              status: receipt.status === 1 ? 'success' : 'failed',
              blockNumber: event.blockNumber,
            })

            totalTrades++
            const volumeInToken = parseFloat(formatUnits(amountIn, decimals))
            totalVolumeUSD += volumeInToken * (tokenPrices[symbol] || 1)
          }
        }
      }

      executionRecords.sort((a, b) => b.blockNumber - a.blockNumber)
      setExecutions(executionRecords)

      setSummary({
        totalClients: clientList.length,
        safeClients: safeCount,
        eoaClients: eoaCount,
        totalTrades,
        totalVolumeUSD,
        totalAUM,
        unrealizedPnL: 0,
        realizedPnL: 0,
        portfolio: Object.values(assetMap),
      })
    } catch (err: any) {
      console.error('Failed to load summary:', err)
      setError(err.message || 'Failed to load summary data')
    } finally {
      setIsLoading(false)
    }
  }, [getManagerClients, getDelegation, wallet])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  return { clients, executions, summary, isLoading, error, refresh: loadData }
}
