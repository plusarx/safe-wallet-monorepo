'use client'

import { useState, useCallback, useRef } from 'react'
import { Contract, BrowserProvider, parseUnits, formatUnits } from 'ethers'
import {
    TRADING_MODULE_ADDRESSES,
    TRADING_MODULE_ABI,
    QUOTER_ADDRESSES,
    QUOTER_ABI,
    FEE_TIERS,
} from '../contracts/TradingModule'

// =============================================================================
// TYPES
// =============================================================================

export type OrderType = 'market' | 'twap' | 'smart_market' | 'smart_twap'

export type OrderStatus = 'pending' | 'executing' | 'partial' | 'filled' | 'cancelled' | 'failed'

export interface OrderParams {
    orderType: OrderType
    clientAddresses: string[]
    tokenIn: { address: string; symbol: string; decimals: number }
    tokenOut: { address: string; symbol: string; decimals: number }
    totalAmount: string
    slippage: number // percentage, e.g., 1.0 = 1%

    // TWAP params
    slices?: number
    durationMinutes?: number

    // Smart params
    chunks?: number
}

export interface OrderState {
    id: string
    params: OrderParams
    status: OrderStatus
    progress: number // 0-100
    executedSlices: number
    totalSlices: number
    executedVolume: string
    txHashes: string[]
    error?: string
    createdAt: Date
    updatedAt: Date
}

export interface ExecutionResult {
    success: boolean
    txHash?: string
    amountOut?: string
    error?: string
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Generate cryptographically random integer in range [min, max]
 */
function randomInt(min: number, max: number): number {
    const range = max - min + 1
    const randomBuffer = new Uint32Array(1)
    crypto.getRandomValues(randomBuffer)
    return min + (randomBuffer[0] % range)
}

/**
 * Fisher-Yates shuffle - cryptographically random permutation
 * Uses PnC concept: n! possible arrangements, each equally likely
 */
function shuffleArray<T>(array: T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
        const j = randomInt(0, i)
            ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generate unique order ID
 */
function generateOrderId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

// =============================================================================
// ORDER ENGINE HOOK
// =============================================================================

export function useOrderEngine() {
    const [isExecuting, setIsExecuting] = useState(false)
    const [currentOrder, setCurrentOrder] = useState<OrderState | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Cancellation ref
    const cancelledRef = useRef(false)

    // -------------------------------------------------------------------------
    // Contract Helpers
    // -------------------------------------------------------------------------

    const getProvider = useCallback(async () => {
        if (typeof window === 'undefined' || !window.ethereum) {
            throw new Error('No wallet detected')
        }
        return new BrowserProvider(window.ethereum as any)
    }, [])

    const getTradingContract = useCallback(async (needsSigner = false) => {
        const provider = await getProvider()
        const network = await provider.getNetwork()
        const chainId = Number(network.chainId)
        const address = TRADING_MODULE_ADDRESSES[chainId]

        if (!address) throw new Error(`Chain ${chainId} not supported`)

        if (needsSigner) {
            const signer = await provider.getSigner()
            return new Contract(address, TRADING_MODULE_ABI, signer)
        }
        return new Contract(address, TRADING_MODULE_ABI, provider)
    }, [getProvider])

    const getQuoter = useCallback(async () => {
        const provider = await getProvider()
        const network = await provider.getNetwork()
        const chainId = Number(network.chainId)
        const address = QUOTER_ADDRESSES[chainId]

        if (!address) throw new Error(`Quoter not available for chain ${chainId}`)

        return new Contract(address, QUOTER_ABI, provider)
    }, [getProvider])

    // -------------------------------------------------------------------------
    // Quote Helper
    // -------------------------------------------------------------------------

    const getQuote = useCallback(async (
        tokenIn: string,
        tokenOut: string,
        amountIn: string,
        tokenInDecimals: number,
        tokenOutDecimals: number,
        feeTier: number = FEE_TIERS.MEDIUM
    ): Promise<string> => {
        if (!amountIn || parseFloat(amountIn) <= 0) return '0'

        try {
            const quoter = await getQuoter()
            const amountInWei = parseUnits(amountIn, tokenInDecimals)

            const amountOutWei = await quoter.quoteExactInputSingle.staticCall(
                tokenIn,
                tokenOut,
                feeTier,
                amountInWei,
                0 // sqrtPriceLimitX96
            )

            return formatUnits(amountOutWei, tokenOutDecimals)
        } catch (err) {
            console.error('Quote error:', err)
            return '0'
        }
    }, [getQuoter])

    // -------------------------------------------------------------------------
    // Single Trade Execution
    // -------------------------------------------------------------------------

    const executeSingleTrade = useCallback(async (
        clientAddress: string,
        tokenIn: { address: string; decimals: number },
        tokenOut: { address: string; decimals: number },
        amountIn: string,
        minAmountOut: string,
        deadline: number
    ): Promise<ExecutionResult> => {
        try {
            const contract = await getTradingContract(true)

            const tradeParams = {
                safe: clientAddress,
                tokenIn: tokenIn.address,
                tokenOut: tokenOut.address,
                amountIn: parseUnits(amountIn, tokenIn.decimals),
                minAmountOut: parseUnits(minAmountOut, tokenOut.decimals),
                feeTier: FEE_TIERS.MEDIUM,
                deadline,
            }

            const tx = await contract.executeTrade(tradeParams)
            const receipt = await tx.wait()

            return { success: true, txHash: receipt.hash }
        } catch (err: any) {
            return { success: false, error: err.reason || err.message || 'Trade failed' }
        }
    }, [getTradingContract])

    // -------------------------------------------------------------------------
    // Batch Trade Execution
    // -------------------------------------------------------------------------

    const executeBatchTrade = useCallback(async (
        clientAddresses: string[],
        tokenIn: { address: string; decimals: number },
        tokenOut: { address: string; decimals: number },
        amountPerClient: string,
        minAmountOut: string,
        deadline: number
    ): Promise<ExecutionResult> => {
        try {
            const contract = await getTradingContract(true)

            const amounts = clientAddresses.map(() => parseUnits(amountPerClient, tokenIn.decimals))

            const tx = await contract.executeBatchTrade(
                clientAddresses,
                tokenIn.address,
                tokenOut.address,
                amounts,
                parseUnits(minAmountOut, tokenOut.decimals),
                FEE_TIERS.MEDIUM,
                deadline
            )
            const receipt = await tx.wait()

            return { success: true, txHash: receipt.hash }
        } catch (err: any) {
            return { success: false, error: err.reason || err.message || 'Batch trade failed' }
        }
    }, [getTradingContract])

    // -------------------------------------------------------------------------
    // Update Order State Helper
    // -------------------------------------------------------------------------

    const updateOrderState = useCallback((updates: Partial<OrderState>) => {
        setCurrentOrder(prev => {
            if (!prev) return null
            const updated = { ...prev, ...updates, updatedAt: new Date() }
            // Persist to localStorage
            try {
                const orders = JSON.parse(localStorage.getItem('order_engine_orders') || '[]')
                const idx = orders.findIndex((o: any) => o.id === updated.id)
                if (idx >= 0) orders[idx] = updated
                else orders.unshift(updated)
                localStorage.setItem('order_engine_orders', JSON.stringify(orders.slice(0, 50)))
            } catch (e) { /* ignore */ }
            return updated
        })
    }, [])

    // -------------------------------------------------------------------------
    // MARKET ORDER
    // -------------------------------------------------------------------------

    const executeMarketOrder = useCallback(async (params: OrderParams): Promise<boolean> => {
        const { clientAddresses, tokenIn, tokenOut, totalAmount, slippage } = params

        // Get quote
        const quote = await getQuote(tokenIn.address, tokenOut.address, totalAmount, tokenIn.decimals, tokenOut.decimals)
        const minOut = (parseFloat(quote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)
        const deadline = Math.floor(Date.now() / 1000) + 600

        let result: ExecutionResult

        if (clientAddresses.length === 1) {
            result = await executeSingleTrade(clientAddresses[0], tokenIn, tokenOut, totalAmount, minOut, deadline)
        } else {
            result = await executeBatchTrade(clientAddresses, tokenIn, tokenOut, totalAmount, minOut, deadline)
        }

        if (result.success) {
            updateOrderState({
                status: 'filled',
                progress: 100,
                executedSlices: 1,
                totalSlices: 1,
                executedVolume: totalAmount,
                txHashes: result.txHash ? [result.txHash] : [],
            })
            return true
        } else {
            updateOrderState({ status: 'failed', error: result.error })
            throw new Error(result.error)
        }
    }, [getQuote, executeSingleTrade, executeBatchTrade, updateOrderState])

    // -------------------------------------------------------------------------
    // TWAP ORDER
    // -------------------------------------------------------------------------

    const executeTWAPOrder = useCallback(async (params: OrderParams): Promise<boolean> => {
        const { clientAddresses, tokenIn, tokenOut, totalAmount, slippage, slices = 4, durationMinutes = 10 } = params

        const sliceAmount = (parseFloat(totalAmount) / slices).toFixed(tokenIn.decimals)
        const intervalMs = (durationMinutes * 60 * 1000) / slices
        const deadline = Math.floor(Date.now() / 1000) + (durationMinutes * 60) + 600

        let executedSlices = 0
        let totalExecutedVolume = 0
        const txHashes: string[] = []

        for (let i = 0; i < slices; i++) {
            if (cancelledRef.current) {
                updateOrderState({ status: 'cancelled' })
                return false
            }

            // Get fresh quote for each slice
            const quote = await getQuote(tokenIn.address, tokenOut.address, sliceAmount, tokenIn.decimals, tokenOut.decimals)
            const minOut = (parseFloat(quote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)

            let result: ExecutionResult
            if (clientAddresses.length === 1) {
                result = await executeSingleTrade(clientAddresses[0], tokenIn, tokenOut, sliceAmount, minOut, deadline)
            } else {
                result = await executeBatchTrade(clientAddresses, tokenIn, tokenOut, sliceAmount, minOut, deadline)
            }

            if (result.success) {
                executedSlices++
                totalExecutedVolume += parseFloat(sliceAmount)
                if (result.txHash) txHashes.push(result.txHash)

                updateOrderState({
                    status: i === slices - 1 ? 'filled' : 'partial',
                    progress: Math.round(((i + 1) / slices) * 100),
                    executedSlices,
                    totalSlices: slices,
                    executedVolume: totalExecutedVolume.toString(),
                    txHashes,
                })
            } else {
                updateOrderState({ status: 'failed', error: result.error })
                throw new Error(result.error)
            }

            // Wait for next slice (except for last one)
            if (i < slices - 1) {
                await sleep(intervalMs)
            }
        }

        return true
    }, [getQuote, executeSingleTrade, executeBatchTrade, updateOrderState])

    // -------------------------------------------------------------------------
    // SMART MARKET ORDER (Chunked + Randomized Concurrent)
    // -------------------------------------------------------------------------

    const executeSmartMarketOrder = useCallback(async (params: OrderParams): Promise<boolean> => {
        const { clientAddresses, tokenIn, tokenOut, totalAmount, slippage, chunks = 5 } = params

        const chunkAmount = (parseFloat(totalAmount) / chunks).toFixed(tokenIn.decimals)
        const deadline = Math.floor(Date.now() / 1000) + 600

        // Create chunk execution promises with random jitter
        const chunkPromises: Promise<ExecutionResult>[] = []

        // Get ONE quote upfront for consistent fill price across all chunks
        const quote = await getQuote(tokenIn.address, tokenOut.address, chunkAmount, tokenIn.decimals, tokenOut.decimals)
        const minOut = (parseFloat(quote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)

        for (let i = 0; i < chunks; i++) {
            const jitterMs = randomInt(100, 800) // 100-800ms random delay

            // Randomize client order for this chunk (PnC: different permutation each time)
            const shuffledClients = shuffleArray(clientAddresses)

            chunkPromises.push(
                sleep(jitterMs).then(async () => {
                    if (shuffledClients.length === 1) {
                        return executeSingleTrade(shuffledClients[0], tokenIn, tokenOut, chunkAmount, minOut, deadline)
                    } else {
                        // Execute with randomized client order
                        return executeBatchTrade(shuffledClients, tokenIn, tokenOut, chunkAmount, minOut, deadline)
                    }
                })
            )
        }

        // Execute all chunks concurrently
        const results = await Promise.allSettled(chunkPromises)

        const txHashes: string[] = []
        let successCount = 0
        let failedError: string | undefined

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.success) {
                successCount++
                if (result.value.txHash) txHashes.push(result.value.txHash)
            } else if (result.status === 'fulfilled' && !result.value.success) {
                failedError = result.value.error
            } else if (result.status === 'rejected') {
                failedError = result.reason?.message || 'Chunk execution failed'
            }
        }

        const allSuccess = successCount === chunks

        updateOrderState({
            status: allSuccess ? 'filled' : successCount > 0 ? 'partial' : 'failed',
            progress: Math.round((successCount / chunks) * 100),
            executedSlices: successCount,
            totalSlices: chunks,
            executedVolume: (parseFloat(chunkAmount) * successCount).toString(),
            txHashes,
            error: allSuccess ? undefined : failedError,
        })

        if (!allSuccess && successCount === 0) {
            throw new Error(failedError || 'All chunks failed')
        }

        return allSuccess
    }, [getQuote, executeSingleTrade, executeBatchTrade, updateOrderState])

    // -------------------------------------------------------------------------
    // SMART TWAP ORDER (TWAP + Chunking)
    // -------------------------------------------------------------------------

    const executeSmartTWAPOrder = useCallback(async (params: OrderParams): Promise<boolean> => {
        const { clientAddresses, tokenIn, tokenOut, totalAmount, slippage, slices = 4, durationMinutes = 10, chunks = 2 } = params

        const sliceAmount = parseFloat(totalAmount) / slices
        const chunkAmount = (sliceAmount / chunks).toFixed(tokenIn.decimals)
        const intervalMs = (durationMinutes * 60 * 1000) / slices
        const deadline = Math.floor(Date.now() / 1000) + (durationMinutes * 60) + 600

        let completedSlices = 0
        let totalExecutedVolume = 0
        const allTxHashes: string[] = []

        for (let sliceIdx = 0; sliceIdx < slices; sliceIdx++) {
            if (cancelledRef.current) {
                updateOrderState({ status: 'cancelled' })
                return false
            }

            // Execute chunks for this slice with randomized timing
            const chunkPromises: Promise<ExecutionResult>[] = []

            for (let chunkIdx = 0; chunkIdx < chunks; chunkIdx++) {
                const jitterMs = randomInt(50, 500)

                // Randomize client order for each chunk (PnC: n! permutations)
                const shuffledClients = shuffleArray(clientAddresses)

                chunkPromises.push(
                    sleep(jitterMs).then(async () => {
                        const quote = await getQuote(tokenIn.address, tokenOut.address, chunkAmount, tokenIn.decimals, tokenOut.decimals)
                        const minOut = (parseFloat(quote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)

                        if (shuffledClients.length === 1) {
                            return executeSingleTrade(shuffledClients[0], tokenIn, tokenOut, chunkAmount, minOut, deadline)
                        } else {
                            // Execute with randomized client order
                            return executeBatchTrade(shuffledClients, tokenIn, tokenOut, chunkAmount, minOut, deadline)
                        }
                    })
                )
            }

            const results = await Promise.allSettled(chunkPromises)

            let sliceSuccess = 0
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value.success) {
                    sliceSuccess++
                    totalExecutedVolume += parseFloat(chunkAmount)
                    if (result.value.txHash) allTxHashes.push(result.value.txHash)
                }
            }

            if (sliceSuccess > 0) completedSlices++

            updateOrderState({
                status: sliceIdx === slices - 1 ? 'filled' : 'partial',
                progress: Math.round(((sliceIdx + 1) / slices) * 100),
                executedSlices: completedSlices,
                totalSlices: slices,
                executedVolume: totalExecutedVolume.toFixed(tokenIn.decimals),
                txHashes: allTxHashes,
            })

            // Wait for next slice
            if (sliceIdx < slices - 1) {
                await sleep(intervalMs)
            }
        }

        return true
    }, [getQuote, executeSingleTrade, executeBatchTrade, updateOrderState])

    // -------------------------------------------------------------------------
    // MAIN EXECUTE FUNCTION
    // -------------------------------------------------------------------------

    const executeOrder = useCallback(async (params: OrderParams): Promise<OrderState> => {
        setIsExecuting(true)
        setError(null)
        cancelledRef.current = false

        const orderId = generateOrderId()
        const initialState: OrderState = {
            id: orderId,
            params,
            status: 'executing',
            progress: 0,
            executedSlices: 0,
            totalSlices: params.orderType === 'market' ? 1 : (params.slices || 1),
            executedVolume: '0',
            txHashes: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        setCurrentOrder(initialState)

        try {
            switch (params.orderType) {
                case 'market':
                    await executeMarketOrder(params)
                    break
                case 'twap':
                    await executeTWAPOrder(params)
                    break
                case 'smart_market':
                    await executeSmartMarketOrder(params)
                    break
                case 'smart_twap':
                    await executeSmartTWAPOrder(params)
                    break
                default:
                    throw new Error(`Unknown order type: ${params.orderType}`)
            }
        } catch (err: any) {
            setError(err.message)
            updateOrderState({ status: 'failed', error: err.message })
        } finally {
            setIsExecuting(false)
        }

        return currentOrder!
    }, [executeMarketOrder, executeTWAPOrder, executeSmartMarketOrder, executeSmartTWAPOrder, updateOrderState, currentOrder])

    // -------------------------------------------------------------------------
    // CANCEL ORDER
    // -------------------------------------------------------------------------

    const cancelOrder = useCallback(() => {
        cancelledRef.current = true
    }, [])

    // -------------------------------------------------------------------------
    // GET ORDER HISTORY
    // -------------------------------------------------------------------------

    const getOrderHistory = useCallback((): OrderState[] => {
        try {
            const stored = localStorage.getItem('order_engine_orders')
            if (!stored) return []
            const parsed = JSON.parse(stored)
            return parsed.map((o: any) => ({
                ...o,
                createdAt: new Date(o.createdAt),
                updatedAt: new Date(o.updatedAt),
            }))
        } catch (e) {
            console.error('Failed to load order history:', e)
            return []
        }
    }, [])

    // -------------------------------------------------------------------------
    // RETURN
    // -------------------------------------------------------------------------

    return {
        // State
        isExecuting,
        currentOrder,
        error,

        // Actions
        executeOrder,
        cancelOrder,
        getQuote,
        getOrderHistory,

        // Constants
        FEE_TIERS,
    }
}
