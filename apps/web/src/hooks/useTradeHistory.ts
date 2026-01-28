'use client'

import { useState, useCallback, useEffect } from 'react'
import { BrowserProvider, Contract, formatUnits } from 'ethers'
import { TRADING_MODULE_ADDRESSES, TRADING_MODULE_ABI, TOKENS_BY_CHAIN } from '../contracts/TradingModule'

// Event signatures for TradingModule
const TRADE_EVENTS_ABI = [
    'event OrderAdded(uint256 indexed batchId, address indexed safe, uint256 sellAmount, uint256 feeAmount)',
    'event BatchExecuted(uint256 indexed batchId, uint256 totalReceived)',
    'event TokensDistributed(uint256 indexed batchId, address indexed safe, uint256 amount)',
]

export interface TradeExecution {
    id: string
    txHash: string
    blockNumber: number
    timestamp: number
    clientAddress: string
    tokenIn: string
    tokenInSymbol: string
    tokenOut: string
    tokenOutSymbol: string
    amountIn: string
    amountOut: string
    fee: string
    status: 'success' | 'failed'
    type: 'gelato' | 'manual' | 'batch'
}

interface UseTradeHistoryOptions {
    chainId?: number
    clientAddresses?: string[]
    limit?: number
}

export function useTradeHistory(options: UseTradeHistoryOptions = {}) {
    const { chainId = 42161, clientAddresses = [], limit = 100 } = options

    const [executions, setExecutions] = useState<TradeExecution[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [totalVolume, setTotalVolume] = useState('0')
    const [totalTrades, setTotalTrades] = useState(0)

    // Get token symbol from address
    const getTokenSymbol = useCallback((address: string): string => {
        const tokens = TOKENS_BY_CHAIN[chainId]
        if (!tokens) return 'UNK'
        const token = Object.values(tokens).find(
            t => t.address.toLowerCase() === address.toLowerCase()
        )
        return token?.symbol || address.slice(0, 6)
    }, [chainId])

    // Fetch trade history from on-chain events
    const fetchTradeHistory = useCallback(async () => {
        if (typeof window === 'undefined' || !(window as any).ethereum) return

        setIsLoading(true)
        setError(null)

        try {
            const provider = new BrowserProvider((window as any).ethereum)
            const tradingModuleAddr = TRADING_MODULE_ADDRESSES[chainId]

            if (!tradingModuleAddr) {
                throw new Error(`TradingModule not deployed on chain ${chainId}`)
            }

            const contract = new Contract(tradingModuleAddr, [...TRADING_MODULE_ABI, ...TRADE_EVENTS_ABI], provider)

            // Get current block
            const currentBlock = await provider.getBlockNumber()
            // Look back ~7 days (assuming ~12s blocks on Arbitrum)
            const fromBlock = Math.max(0, currentBlock - 50000)

            // Build filter for OrderAdded events
            const filter = contract.filters.OrderAdded()
            const events = await contract.queryFilter(filter, fromBlock, currentBlock)

            // Process events into trade executions
            const trades: TradeExecution[] = []
            let volumeUSD = 0

            for (const event of events.slice(-limit)) {
                const log = event as any
                const { batchId, safe, sellAmount, feeAmount } = log.args || {}

                // Check if this client is in our filter (if provided)
                if (clientAddresses.length > 0) {
                    const safeAddr = safe?.toLowerCase()
                    if (!clientAddresses.some(c => c.toLowerCase() === safeAddr)) {
                        continue
                    }
                }

                // Get transaction receipt for more details
                // const tx = await event.getTransaction()
                const block = await event.getBlock()

                // Try to decode batch info
                let tokenIn = '', tokenOut = ''
                try {
                    const batch = await contract.batches(batchId)
                    tokenIn = batch.tokenIn || ''
                    tokenOut = batch.tokenOut || ''
                } catch {
                    // Batch might not be accessible
                }

                const trade: TradeExecution = {
                    id: `${event.transactionHash}-${event.index}`,
                    txHash: event.transactionHash,
                    blockNumber: event.blockNumber,
                    timestamp: block?.timestamp || 0,
                    clientAddress: safe || '',
                    tokenIn,
                    tokenInSymbol: getTokenSymbol(tokenIn),
                    tokenOut,
                    tokenOutSymbol: getTokenSymbol(tokenOut),
                    amountIn: sellAmount ? formatUnits(sellAmount, 6) : '0', // Assume 6 decimals
                    amountOut: '0', // Would need to match with TokensDistributed event
                    fee: feeAmount ? formatUnits(feeAmount, 6) : '0',
                    status: 'success',
                    type: 'batch',
                }

                trades.push(trade)
                volumeUSD += parseFloat(trade.amountIn) || 0
            }

            // Also fetch ExecutionFromModuleSuccess events for Gelato trades
            // These come from the Safe, not TradingModule, so we query differently
            // For now, rely on the above batch events

            setExecutions(trades.reverse()) // Most recent first
            setTotalVolume(volumeUSD.toFixed(2))
            setTotalTrades(trades.length)

        } catch (err: any) {
            console.error('[useTradeHistory] Failed to fetch:', err)
            setError(err.message || 'Failed to fetch trade history')
        } finally {
            setIsLoading(false)
        }
    }, [chainId, clientAddresses, limit, getTokenSymbol])

    // Also fetch from localStorage for Gelato tasks that completed
    const fetchGelatoHistory = useCallback(() => {
        try {
            const stored = localStorage.getItem('gelato_trigger_tasks_v3')
            if (!stored) return []

            const tasks = JSON.parse(stored)
            const completedTasks = tasks.filter((t: any) => t.status === 'completed')

            return completedTasks.map((task: any) => ({
                id: task.taskId,
                txHash: task.executionData?.txHash || '',
                blockNumber: 0,
                timestamp: new Date(task.createdAt).getTime() / 1000,
                clientAddress: task.tradeParams?.safe || '',
                tokenIn: task.tradeParams?.tokenIn || '',
                tokenInSymbol: getTokenSymbol(task.tradeParams?.tokenIn || ''),
                tokenOut: task.tradeParams?.tokenOut || '',
                tokenOutSymbol: getTokenSymbol(task.tradeParams?.tokenOut || ''),
                amountIn: task.tradeParams?.amountIn
                    ? formatUnits(BigInt(task.tradeParams.amountIn), 6)
                    : '0',
                amountOut: '0',
                fee: '0',
                status: 'success' as const,
                type: 'gelato' as const,
            }))
        } catch {
            return []
        }
    }, [getTokenSymbol])

    // Combined fetch
    const refresh = useCallback(async () => {
        await fetchTradeHistory()

        // Merge with Gelato history
        const gelatoTrades = fetchGelatoHistory()
        setExecutions(prev => {
            // Dedupe by txHash
            const existingHashes = new Set(prev.map(p => p.txHash))
            const newTrades = gelatoTrades.filter((g: TradeExecution) => !existingHashes.has(g.txHash))
            return [...newTrades, ...prev].sort((a, b) => b.timestamp - a.timestamp)
        })
    }, [fetchTradeHistory, fetchGelatoHistory])

    // Auto-fetch on mount
    useEffect(() => {
        refresh()
    }, [refresh])

    return {
        executions,
        isLoading,
        error,
        totalVolume,
        totalTrades,
        refresh,
    }
}
