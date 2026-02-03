'use client'

import { useState, useCallback, useRef } from 'react'
import { Contract, BrowserProvider, parseUnits, formatUnits } from 'ethers'
import {
    TRADING_MODULE_ADDRESSES,
    TRADING_MODULE_ADDRESS, // Import default address
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

    // Amount Mode
    amountMode?: 'fixed' | 'percentage'
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

    // Slippage tracking for A/B testing
    expectedAmountOut?: string
    actualAmountOut?: string
    realizedSlippage?: number // percentage difference: ((expected - actual) / expected) * 100
    priceImpact?: number // percentage price impact from the trade

    // A/B Test group assignment
    testGroup?: 'A' | 'B' | 'control'
    testMetadata?: {
        assignedAt: Date
        slippageSetting: number
        marketConditions?: {
            spotPrice: string
            liquidity?: string
            volatility?: string
        }
    }

    // Slippage Analysis Data (for A/B testing)
    slippageAnalysis?: {
        timestamp: Date              // Time - when the fill occurred
        fillPrice: number            // Fill price/swap price - actual execution price (tokenIn/tokenOut)
        expectedPrice: number        // Expected price from quote
        isConcurrent: boolean        // Concurrently/not - was this executed concurrently (Smart Market/Smart TWAP)
        quantity: string             // Quantity - amount traded
        slippageBps: number          // Slippage in basis points (1 bps = 0.01%)
        priceImpactBps: number       // Price impact in basis points
    }
}

export interface ExecutionResult {
    success: boolean
    txHash?: string
    amountOut?: string
    error?: string
    gasUsed?: string
    effectiveGasPrice?: string
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

/**
 * A/B Test group assignment using cryptographic randomness
 * Ensures 33/33/33 distribution across groups
 */
function assignTestGroup(): 'A' | 'B' | 'control' {
    const rand = randomInt(0, 99)
    if (rand < 33) return 'A'
    if (rand < 66) return 'B'
    return 'control'
}

/**
 * Calculate realized slippage percentage
 * Positive = worse than expected, Negative = better than expected
 */
function calculateRealizedSlippage(expected: string, actual: string): number {
    const exp = parseFloat(expected)
    const act = parseFloat(actual)
    if (exp === 0 || isNaN(exp) || isNaN(act)) return 0
    return ((exp - act) / exp) * 100
}

/**
 * Calculate price impact from quote vs spot price
 * Uses the formula: priceImpact = (executionPrice - spotPrice) / spotPrice * 100
 */
function calculatePriceImpact(
    amountIn: string,
    amountOut: string,
    spotPrice: string // price of tokenOut in terms of tokenIn
): number {
    const inAmt = parseFloat(amountIn)
    const outAmt = parseFloat(amountOut)
    const spot = parseFloat(spotPrice)

    if (inAmt === 0 || outAmt === 0 || spot === 0 || isNaN(inAmt) || isNaN(outAmt) || isNaN(spot)) {
        return 0
    }

    // Execution price = amountIn / amountOut (how much tokenIn per tokenOut)
    const executionPrice = inAmt / outAmt

    // Price impact percentage (positive = paying more than spot)
    return ((executionPrice - spot) / spot) * 100
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn()
        } catch (err) {
            lastError = err as Error
            if (attempt < maxRetries - 1) {
                const delay = baseDelayMs * Math.pow(2, attempt) + randomInt(0, 500)
                await sleep(delay)
            }
        }
    }

    throw lastError
}

/**
 * Calculate fill price (execution price)
 * fillPrice = amountIn / amountOut (how much tokenIn per tokenOut)
 */
function calculateFillPrice(amountIn: string, amountOut: string): number {
    const inAmt = parseFloat(amountIn)
    const outAmt = parseFloat(amountOut)
    if (outAmt === 0 || isNaN(inAmt) || isNaN(outAmt)) return 0
    return inAmt / outAmt
}

/**
 * Convert percentage to basis points
 * 1% = 100 bps, 0.01% = 1 bps
 */
function percentToBps(percent: number): number {
    return Math.round(percent * 100)
}

/**
 * Build slippage analysis data structure
 */
function buildSlippageAnalysis(
    amountIn: string,
    expectedAmountOut: string,
    actualAmountOut: string,
    isConcurrent: boolean
): {
    timestamp: Date
    fillPrice: number
    expectedPrice: number
    isConcurrent: boolean
    quantity: string
    slippageBps: number
    priceImpactBps: number
} {
    const fillPrice = calculateFillPrice(amountIn, actualAmountOut)
    const expectedPrice = calculateFillPrice(amountIn, expectedAmountOut)
    const realizedSlippage = calculateRealizedSlippage(expectedAmountOut, actualAmountOut)

    // Price impact = (fillPrice - expectedPrice) / expectedPrice * 100
    const priceImpactPercent = expectedPrice > 0
        ? ((fillPrice - expectedPrice) / expectedPrice) * 100
        : 0

    return {
        timestamp: new Date(),
        fillPrice,
        expectedPrice,
        isConcurrent,
        quantity: amountIn,
        slippageBps: percentToBps(realizedSlippage),
        priceImpactBps: percentToBps(priceImpactPercent),
    }
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
        const address = TRADING_MODULE_ADDRESSES[chainId] || TRADING_MODULE_ADDRESSES[42161] || TRADING_MODULE_ADDRESS

        if (!address) throw new Error(`Trading Module not available for chain ${chainId}`)

        console.log('[OrderEngine] Using Trading Module at:', address, 'for chain:', chainId)

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
        const address = QUOTER_ADDRESSES[chainId] || QUOTER_ADDRESSES[42161]

        if (!address) throw new Error(`Quoter not available for chain ${chainId}`)

        return new Contract(address, QUOTER_ABI, provider)
    }, [getProvider])

    // -------------------------------------------------------------------------
    // Balance Helper
    // -------------------------------------------------------------------------



    const calculateOrderAmounts = useCallback(async (
        clientAddresses: string[],
        tokenIn: { address: string; decimals: number },
        amountVal: string,
        mode: 'fixed' | 'percentage'
    ): Promise<string[]> => {
        if (mode === 'fixed') {
            return clientAddresses.map(() => amountVal)
        } else {
            // Percentage mode: fetch balances and calculate
            const percent = parseFloat(amountVal)
            if (isNaN(percent) || percent <= 0 || percent > 100) throw new Error('Invalid percentage')

            const provider = await getProvider()
            const erc20 = new Contract(tokenIn.address, ['function balanceOf(address) view returns (uint256)'], provider)

            // Multicall would be better but parallel promises ok for <20 clients
            const balances = await Promise.all(clientAddresses.map(addr => erc20.balanceOf(addr)))

            return balances.map(bal => {
                const balFormatted = formatUnits(bal, tokenIn.decimals)
                const amount = parseFloat(balFormatted) * (percent / 100)
                return amount.toFixed(tokenIn.decimals)
            })
        }
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
        feeTier: number = FEE_TIERS.LOW
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
            // console.warn(`Quote failed for fee ${feeTier}:`, err)
            return '0'
        }
    }, [getQuoter])

    const getBestQuote = useCallback(async (
        tokenIn: string,
        tokenOut: string,
        amountIn: string,
        tokenInDecimals: number,
        tokenOutDecimals: number
    ): Promise<{ amountOut: string, feeTier: number }> => {
        if (!amountIn || parseFloat(amountIn) <= 0) return { amountOut: '0', feeTier: FEE_TIERS.LOW }

        const tiers = [FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH]
        let bestOut = 0n
        let bestFee = FEE_TIERS.LOW

        // We can run these in parallel
        const results = await Promise.all(tiers.map(async (fee) => {
            try {
                const q = await getQuote(tokenIn, tokenOut, amountIn, tokenInDecimals, tokenOutDecimals, fee)
                return { fee, amount: parseUnits(q, tokenOutDecimals) }
            } catch {
                return { fee, amount: 0n }
            }
        }))

        for (const res of results) {
            if (res.amount > bestOut) {
                bestOut = res.amount
                bestFee = res.fee
            }
        }

        if (bestOut === 0n) return { amountOut: '0', feeTier: FEE_TIERS.LOW }

        return {
            amountOut: formatUnits(bestOut, tokenOutDecimals),
            feeTier: bestFee
        }
    }, [getQuote])

    // -------------------------------------------------------------------------
    // Single Trade Execution
    // -------------------------------------------------------------------------

    const executeSingleTrade = useCallback(async (
        clientAddress: string,
        tokenIn: { address: string; decimals: number },
        tokenOut: { address: string; decimals: number },
        amountIn: string,
        minAmountOut: string,
        deadline: number,
        feeTier: number = FEE_TIERS.LOW, // Added feeTier param
        enableRetry: boolean = true
    ): Promise<ExecutionResult> => {
        const executeOnce = async (): Promise<ExecutionResult> => {
            try {
                console.log(`[OrderEngine] Executing Single Trade for: ${clientAddress} (Fee: ${feeTier})`)
                const contract = await getTradingContract(true)

                // Verify contract exists
                if (!contract.target) throw new Error('Contract target is null')

                const tradeParams = {
                    safe: clientAddress,
                    tokenIn: tokenIn.address,
                    tokenOut: tokenOut.address,
                    amountIn: parseUnits(amountIn, tokenIn.decimals),
                    minAmountOut: parseUnits(minAmountOut, tokenOut.decimals),
                    feeTier,
                    deadline,
                }

                console.log('[OrderEngine] Trade Params:', tradeParams)

                // 1. Simulate with callStatic to check for reverts
                try {
                    await contract.executeTrade.staticCall(tradeParams, { gasLimit: 5000000 })
                } catch (simulationError: any) {
                    console.warn('[OrderEngine] Simulation failed:', simulationError)
                    throw new Error(`Simulation failed: ${simulationError.reason || simulationError.message}`)
                }

                // 2. Execute actual transaction
                // FORCE GAS LIMIT to bypass estimation errors (which silent-fail in some wallets)
                const tx = await contract.executeTrade(tradeParams, { gasLimit: 5000000 })
                console.log('[OrderEngine] Tx sent:', tx.hash)
                const receipt = await tx.wait()
                console.log('[OrderEngine] Tx confirmed:', receipt.hash)

                // Parse TradeExecuted event to get actual amountOut
                let amountOut: string | undefined
                let gasUsed: string | undefined
                let effectiveGasPrice: string | undefined

                if (receipt.logs) {
                    for (const log of receipt.logs) {
                        try {
                            const parsed = contract.interface.parseLog({
                                topics: log.topics as string[],
                                data: log.data
                            })
                            if (parsed?.name === 'TradeExecuted') {
                                amountOut = formatUnits(parsed.args.amountOut, tokenOut.decimals)
                            }
                        } catch {
                            // Not our event, skip
                        }
                    }
                }

                if (receipt.gasUsed) {
                    gasUsed = receipt.gasUsed.toString()
                }
                if (receipt.gasPrice) {
                    effectiveGasPrice = receipt.gasPrice.toString()
                }

                return { success: true, txHash: receipt.hash, amountOut, gasUsed, effectiveGasPrice }
            } catch (err: any) {
                console.error('[OrderEngine] Single Trade Error:', err)
                const error = err.reason || err.message || 'Trade failed'
                // Don't retry on slippage errors or user rejections
                if (error.includes('slippage') || error.includes('user rejected') || error.includes('insufficient')) {
                    throw new Error(error)
                }
                return { success: false, error }
            }
        }

        if (enableRetry) {
            try {
                return await retryWithBackoff(executeOnce, 2, 500)
            } catch (err: any) {
                return { success: false, error: err.message || 'Trade failed after retries' }
            }
        }

        return executeOnce()
    }, [getTradingContract])

    // -------------------------------------------------------------------------
    // Batch Trade Execution
    // -------------------------------------------------------------------------

    const executeBatchTrade = useCallback(async (
        clientAddresses: string[],
        tokenIn: { address: string; decimals: number },
        tokenOut: { address: string; decimals: number },
        amountsOrAmountPerClient: string | string[],
        minAmountOut: string,
        deadline: number,
        feeTier: number = FEE_TIERS.LOW,
        enableRetry: boolean = true
    ): Promise<ExecutionResult> => {
        const executeOnce = async (): Promise<ExecutionResult> => {
            try {
                const contract = await getTradingContract(true)

                // Handle both fixed single amount and array of amounts
                let amounts: bigint[]
                if (Array.isArray(amountsOrAmountPerClient)) {
                    amounts = amountsOrAmountPerClient.map(a => parseUnits(a, tokenIn.decimals))
                } else {
                    amounts = clientAddresses.map(() => parseUnits(amountsOrAmountPerClient, tokenIn.decimals))
                }

                console.log(`[OrderEngine] Executing Batch Trade for: ${clientAddresses} (Fee: ${feeTier})`)
                const batchParams = {
                    safes: clientAddresses,
                    tokenIn: tokenIn.address,
                    tokenOut: tokenOut.address,
                    amounts,
                    minAmountOut: parseUnits(minAmountOut, tokenOut.decimals),
                    feeTier,
                    deadline,
                    gasLimit: 8000000
                }
                console.log('[OrderEngine] Batch Params:', batchParams)

                // 1. Simulate with callStatic to check for reverts
                try {
                    await contract.executeBatchTrade.staticCall(
                        clientAddresses,
                        tokenIn.address,
                        tokenOut.address,
                        amounts,
                        parseUnits(minAmountOut, tokenOut.decimals),
                        feeTier,
                        deadline,
                        { gasLimit: 8000000 }
                    )
                } catch (simulationError: any) {
                    console.warn('[OrderEngine] Batch simulation failed:', simulationError)
                    throw new Error(`Simulation failed: ${simulationError.reason || simulationError.message}`)
                }

                // 2. Execute actual transaction
                const tx = await contract.executeBatchTrade(
                    clientAddresses,
                    tokenIn.address,
                    tokenOut.address,
                    amounts,
                    parseUnits(minAmountOut, tokenOut.decimals),
                    feeTier,
                    deadline,
                    { gasLimit: 8000000 }
                )

                console.log('[OrderEngine] Batch Tx sent:', tx.hash)
                const receipt = await tx.wait()
                console.log('[OrderEngine] Batch Tx confirmed:', receipt.hash)

                // Parse BatchTradeExecuted event to get total amounts
                let totalAmountOut: string | undefined
                let gasUsed: string | undefined
                let effectiveGasPrice: string | undefined

                if (receipt.logs) {
                    let aggregatedOut = 0n
                    for (const log of receipt.logs) {
                        try {
                            const parsed = contract.interface.parseLog({
                                topics: log.topics as string[],
                                data: log.data
                            })
                            // Sum up individual TradeExecuted events for batch
                            if (parsed?.name === 'TradeExecuted') {
                                aggregatedOut += parsed.args.amountOut
                            }
                        } catch {
                            // Not our event, skip
                        }
                    }
                    if (aggregatedOut > 0n) {
                        totalAmountOut = formatUnits(aggregatedOut, tokenOut.decimals)
                    }
                }

                if (receipt.gasUsed) {
                    gasUsed = receipt.gasUsed.toString()
                }
                if (receipt.gasPrice) {
                    effectiveGasPrice = receipt.gasPrice.toString()
                }

                return { success: true, txHash: receipt.hash, amountOut: totalAmountOut, gasUsed, effectiveGasPrice }
            } catch (err: any) {
                console.error('[OrderEngine] Batch Trade Error:', err)
                const error = err.reason || err.message || 'Batch trade failed'
                // Don't retry on slippage errors or user rejections (or simulation failures)
                if (error.includes('slippage') || error.includes('user rejected') || error.includes('insufficient') || error.includes('Simulation')) {
                    throw new Error(error)
                }
                return { success: false, error }
            }
        }

        if (enableRetry) {
            try {
                return await retryWithBackoff(executeOnce, 2, 500)
            } catch (err: any) {
                return { success: false, error: err.message || 'Batch trade failed after retries' }
            }
        }

        return executeOnce()
    }, [getTradingContract])

    // -------------------------------------------------------------------------
    // Update Order State Helper
    // -------------------------------------------------------------------------

    const updateOrderState = useCallback((updates: Partial<OrderState>) => {
        // Update localStorage synchronously FIRST (before React state batching)
        // This prevents race conditions where 'failed' could overwrite 'filled'
        let currentOrderId: string | null = null
        setCurrentOrder(prev => {
            currentOrderId = prev?.id || null
            return prev
        })

        if (!currentOrderId) {
            // Try to get orderID from the update itself or skip
            console.warn('[OrderEngine] updateOrderState called without current order')
            return
        }

        try {
            const orders = JSON.parse(localStorage.getItem('order_engine_orders') || '[]')
            const idx = orders.findIndex((o: any) => o.id === currentOrderId)

            if (idx >= 0) {
                const existing = orders[idx]

                // CRITICAL: Prevent 'failed' from overwriting terminal success states
                // Once an order is 'filled', it should not be changed to 'failed'
                const isTerminalSuccess = existing.status === 'filled'
                const isSettingFailed = updates.status === 'failed'

                if (isTerminalSuccess && isSettingFailed) {
                    console.warn(`[OrderEngine] Ignoring 'failed' update for order ${currentOrderId} which is already 'filled'`)
                    return // Don't overwrite successful order
                }

                orders[idx] = { ...existing, ...updates, updatedAt: new Date().toISOString() }
            } else {
                // Order not found, this shouldn't happen but handle gracefully
                console.warn(`[OrderEngine] Order ${currentOrderId} not found in localStorage for update`)
            }

            localStorage.setItem('order_engine_orders', JSON.stringify(orders.slice(0, 2000)))
        } catch (e) {
            console.error('[OrderEngine] Failed to update localStorage:', e)
        }

        // Now update React state
        setCurrentOrder(prev => {
            if (!prev) return null

            // Same terminal state protection for React state
            const isTerminalSuccess = prev.status === 'filled'
            const isSettingFailed = updates.status === 'failed'
            if (isTerminalSuccess && isSettingFailed) {
                return prev // Don't update state
            }

            return { ...prev, ...updates, updatedAt: new Date() }
        })
    }, [])

    // -------------------------------------------------------------------------
    // MARKET ORDER
    // -------------------------------------------------------------------------

    const executeMarketOrder = useCallback(async (params: OrderParams): Promise<boolean> => {
        const { clientAddresses, tokenIn, tokenOut, totalAmount, slippage, amountMode = 'fixed' } = params

        // Calculate actual amounts per client
        const amounts = await calculateOrderAmounts(clientAddresses, tokenIn, totalAmount, amountMode)

        // For logging/tracking, we need an aggregate "total" for UX
        const aggregateTotal = amounts.reduce((acc, val) => acc + parseFloat(val), 0).toString()

        // Get quote (this is our expected aggregated amount out)
        // Use getBestQuote to find optimal fee tier
        const { amountOut: quote, feeTier } = await getBestQuote(tokenIn.address, tokenOut.address, aggregateTotal, tokenIn.decimals, tokenOut.decimals)

        // Check if quote is valid
        if (quote === '0') throw new Error('No liquidity found for trade')

        const deadline = Math.floor(Date.now() / 1000) + 600

        // Get spot price for price impact calculation (1 unit quote)
        const spotQuote = await getQuote(tokenIn.address, tokenOut.address, '1', tokenIn.decimals, tokenOut.decimals, feeTier)
        const spotPrice = spotQuote !== '0' ? (1 / parseFloat(spotQuote)).toString() : '0'

        // Store expected amount for slippage tracking
        updateOrderState({
            expectedAmountOut: quote,
            testMetadata: {
                assignedAt: new Date(),
                slippageSetting: slippage,
                marketConditions: { spotPrice }
            }
        })

        let result: ExecutionResult

        if (clientAddresses.length === 1) {
            const sQuote = await getQuote(tokenIn.address, tokenOut.address, amounts[0], tokenIn.decimals, tokenOut.decimals, feeTier)
            const sMin = (parseFloat(sQuote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)
            result = await executeSingleTrade(clientAddresses[0], tokenIn, tokenOut, amounts[0], sMin, deadline, feeTier)
        } else {
            // ALWAYS BATCH for multiple clients
            // To be safe with non-uniform amounts, we must find the SMALLEST amount
            // and calculate minAmountOut based on that.
            // This ensures NO trade in the batch fails the "Too little received" check.

            // Find minimum amount (compare as BigInt to be precise, or just float for approximation)
            let minVal = parseUnits(amounts[0], tokenIn.decimals)
            let minAmtStr = amounts[0]

            for (let i = 1; i < amounts.length; i++) {
                const val = parseUnits(amounts[i], tokenIn.decimals)
                if (val < minVal) {
                    minVal = val
                    minAmtStr = amounts[i]
                }
            }

            // Calculate safe minOut relative to the smallest trade
            const sQuote = await getQuote(tokenIn.address, tokenOut.address, minAmtStr, tokenIn.decimals, tokenOut.decimals, feeTier)
            const minOutPerTrade = (parseFloat(sQuote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)

            const clientsWithAmounts = clientAddresses.map((addr, i) => ({ addr, amt: amounts[i] }))
            const shuffled = shuffleArray(clientsWithAmounts)

            result = await executeBatchTrade(
                shuffled.map(c => c.addr),
                tokenIn,
                tokenOut,
                shuffled.map(c => c.amt),
                minOutPerTrade,
                deadline,
                feeTier
            )
        }


        if (result.success) {
            // Calculate realized slippage and price impact
            const actualOut = result.amountOut || quote
            const realizedSlip = calculateRealizedSlippage(quote, actualOut)
            const priceImpact = calculatePriceImpact(aggregateTotal, actualOut, spotPrice)

            // Build slippage analysis for A/B testing
            const slippageAnalysis = buildSlippageAnalysis(
                aggregateTotal,
                quote,
                actualOut,
                true // Market order IS concurrent
            )

            updateOrderState({
                status: 'filled',
                progress: 100,
                executedSlices: 1,
                totalSlices: 1,
                executedVolume: aggregateTotal,
                txHashes: result.txHash ? [result.txHash] : [],
                actualAmountOut: actualOut,
                realizedSlippage: realizedSlip,
                priceImpact,
                slippageAnalysis,
            })
            return true
        } else {
            updateOrderState({ status: 'failed', error: result.error })
            throw new Error(result.error)
        }
    }, [getQuote, getBestQuote, executeSingleTrade, executeBatchTrade, updateOrderState, calculateOrderAmounts])

    // -------------------------------------------------------------------------
    // TWAP ORDER
    // -------------------------------------------------------------------------

    const executeTWAPOrder = useCallback(async (params: OrderParams): Promise<boolean> => {
        const { clientAddresses, tokenIn, tokenOut, totalAmount, slippage, slices = 4, durationMinutes = 10, amountMode = 'fixed' } = params

        // 1. Calculate TOTAL amounts for each client first (snapshot based on mode)
        const totalAmountsPerClient = await calculateOrderAmounts(clientAddresses, tokenIn, totalAmount, amountMode)

        // 2. Aggregate Total (for stats)
        const aggregateTotal = totalAmountsPerClient.reduce((acc, val) => acc + parseFloat(val), 0).toString()

        // 3. Calculate Slice Amounts: Each client's total / slices
        const sliceAmountsPerClient = totalAmountsPerClient.map(total => (parseFloat(total) / slices).toFixed(tokenIn.decimals))

        // Use aggregate slice amount for quotes (approximation)
        const aggregateSliceAmount = (parseFloat(aggregateTotal) / slices).toFixed(tokenIn.decimals)

        const intervalMs = (durationMinutes * 60 * 1000) / slices
        const deadline = Math.floor(Date.now() / 1000) + (durationMinutes * 60) + 600

        // Get initial spot price for tracking
        // 4. FIND BEST FEE TIER using the full amount (closest approximation to pool liquidity)
        const { amountOut: totalExpectedQuote, feeTier } = await getBestQuote(tokenIn.address, tokenOut.address, aggregateTotal, tokenIn.decimals, tokenOut.decimals)

        // Check if liquidity exists
        if (totalExpectedQuote === '0') throw new Error('No liquidity found for TWAP trade')

        // Use found fee tier for spot price
        const spotQuote = await getQuote(tokenIn.address, tokenOut.address, '1', tokenIn.decimals, tokenOut.decimals, feeTier)
        const spotPrice = spotQuote !== '0' ? (1 / parseFloat(spotQuote)).toString() : '0'

        updateOrderState({
            expectedAmountOut: totalExpectedQuote,
            testMetadata: {
                assignedAt: new Date(),
                slippageSetting: slippage,
                marketConditions: { spotPrice }
            }
        })

        let executedSlices = 0
        let failedSlices = 0
        let totalExecutedVolume = 0
        let totalActualOut = 0
        const txHashes: string[] = []
        const errors: string[] = []

        for (let i = 0; i < slices; i++) {
            if (cancelledRef.current) {
                updateOrderState({ status: 'cancelled' })
                return false
            }

            // Get fresh quote for each slice using the determined BEST FEE TIER
            const quote = await getQuote(tokenIn.address, tokenOut.address, aggregateSliceAmount, tokenIn.decimals, tokenOut.decimals, feeTier)


            let result: ExecutionResult
            if (clientAddresses.length === 1) {
                const sQuote = await getQuote(tokenIn.address, tokenOut.address, sliceAmountsPerClient[0], tokenIn.decimals, tokenOut.decimals, feeTier)
                const sMin = (parseFloat(sQuote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)
                result = await executeSingleTrade(clientAddresses[0], tokenIn, tokenOut, sliceAmountsPerClient[0], sMin, deadline, feeTier)
            } else {
                // ALWAYS BATCH logic
                // Find minimum amount in this slice set
                let minVal = parseUnits(sliceAmountsPerClient[0], tokenIn.decimals)
                let minAmtStr = sliceAmountsPerClient[0]

                for (let i = 1; i < sliceAmountsPerClient.length; i++) {
                    const val = parseUnits(sliceAmountsPerClient[i], tokenIn.decimals)
                    if (val < minVal) {
                        minVal = val
                        minAmtStr = sliceAmountsPerClient[i]
                    }
                }

                const sQuote = await getQuote(tokenIn.address, tokenOut.address, minAmtStr, tokenIn.decimals, tokenOut.decimals, feeTier)
                const minOutPerTrade = (parseFloat(sQuote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)

                const clientsWithAmounts = clientAddresses.map((addr, idx) => ({ addr, amt: sliceAmountsPerClient[idx] }))
                const shuffled = shuffleArray(clientsWithAmounts)

                result = await executeBatchTrade(
                    shuffled.map(c => c.addr),
                    tokenIn,
                    tokenOut,
                    shuffled.map(c => c.amt),
                    minOutPerTrade,
                    deadline,
                    feeTier
                )
            }

            if (result.success) {
                executedSlices++
                totalExecutedVolume += parseFloat(aggregateSliceAmount)
                if (result.txHash) txHashes.push(result.txHash)
                if (result.amountOut) {
                    totalActualOut += parseFloat(result.amountOut)
                } else {
                    totalActualOut += parseFloat(quote) // Use quote as fallback
                }
            } else {
                failedSlices++
                if (result.error) errors.push(`Slice ${i + 1}: ${result.error}`)
            }

            // Calculate running slippage metrics
            const expectedSoFar = (parseFloat(totalExpectedQuote) / slices) * (executedSlices + failedSlices)
            const realizedSlip = expectedSoFar > 0 ? calculateRealizedSlippage(expectedSoFar.toString(), totalActualOut.toString()) : 0

            updateOrderState({
                status: i === slices - 1
                    ? (failedSlices === slices ? 'failed' : failedSlices > 0 ? 'partial' : 'filled')
                    : 'partial',
                progress: Math.round(((i + 1) / slices) * 100),
                executedSlices,
                totalSlices: slices,
                executedVolume: totalExecutedVolume.toString(),
                txHashes,
                actualAmountOut: totalActualOut.toString(),
                realizedSlippage: realizedSlip,
                error: errors.length > 0 ? errors.join('; ') : undefined,
            })

            // Wait for next slice (except for last one)
            if (i < slices - 1) {
                await sleep(intervalMs)
            }
        }

        // Final price impact calculation
        if (totalActualOut > 0) {
            const priceImpact = calculatePriceImpact(totalExecutedVolume.toString(), totalActualOut.toString(), spotPrice)

            const slippageAnalysis = buildSlippageAnalysis(
                totalExecutedVolume.toString(),
                totalExpectedQuote,
                totalActualOut.toString(),
                true
            )

            updateOrderState({ priceImpact, slippageAnalysis })
        }

        if (executedSlices === 0) {
            throw new Error(errors.join('; ') || 'All slices failed')
        }

        return failedSlices === 0
    }, [getQuote, getBestQuote, executeSingleTrade, executeBatchTrade, updateOrderState, calculateOrderAmounts])

    // -------------------------------------------------------------------------
    // SMART MARKET ORDER (Chunked + Randomized Concurrent)
    // -------------------------------------------------------------------------

    const executeSmartMarketOrder = useCallback(async (params: OrderParams): Promise<boolean> => {
        const { clientAddresses, tokenIn, tokenOut, totalAmount, slippage, chunks = 5, amountMode = 'fixed' } = params

        // 1. Calculate TOTAL amounts for each client
        const totalAmountsPerClient = await calculateOrderAmounts(clientAddresses, tokenIn, totalAmount, amountMode)

        // 2. Aggregate Total (for stats)
        const aggregateTotal = totalAmountsPerClient.reduce((acc, val) => acc + parseFloat(val), 0).toString()

        // 3. Chunk Amounts: Each client's total / chunks
        const chunkAmountsPerClient = totalAmountsPerClient.map(total => (parseFloat(total) / chunks).toFixed(tokenIn.decimals))

        // Aggregated chunk amount for quoting
        const aggregateChunkAmount = (parseFloat(aggregateTotal) / chunks).toFixed(tokenIn.decimals)

        const deadline = Math.floor(Date.now() / 1000) + 600

        // Get total expected output AND BEST FEE TIER
        const { amountOut: totalExpectedQuote, feeTier } = await getBestQuote(tokenIn.address, tokenOut.address, aggregateTotal, tokenIn.decimals, tokenOut.decimals)

        if (totalExpectedQuote === '0') throw new Error('No liquidity found for Smart Market trade')

        // Get spot price for price impact calculation using the found fee
        const spotQuote = await getQuote(tokenIn.address, tokenOut.address, '1', tokenIn.decimals, tokenOut.decimals, feeTier)
        const spotPrice = spotQuote !== '0' ? (1 / parseFloat(spotQuote)).toString() : '0'

        // Get ONE quote upfront for consistent fill price (using aggregate chunk) with BEST FEE
        const quote = await getQuote(tokenIn.address, tokenOut.address, aggregateChunkAmount, tokenIn.decimals, tokenOut.decimals, feeTier)


        updateOrderState({
            expectedAmountOut: totalExpectedQuote,
            testMetadata: {
                assignedAt: new Date(),
                slippageSetting: slippage,
                marketConditions: { spotPrice }
            }
        })

        // Create chunk execution promises with random jitter
        const chunkPromises: Promise<ExecutionResult>[] = []

        for (let i = 0; i < chunks; i++) {
            const jitterMs = randomInt(100, 800) // 100-800ms random delay

            // Randomize client order for this chunk
            // We need to keep amounts paired with clients
            const clientsWithAmounts = clientAddresses.map((addr, idx) => ({ addr, amt: chunkAmountsPerClient[idx] }))
            const shuffled = shuffleArray(clientsWithAmounts)

            chunkPromises.push(
                sleep(jitterMs).then(async () => {
                    if (shuffled.length === 1) {
                        const sQuote = await getQuote(tokenIn.address, tokenOut.address, shuffled[0].amt, tokenIn.decimals, tokenOut.decimals, feeTier)
                        const sMin = (parseFloat(sQuote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)
                        return executeSingleTrade(shuffled[0].addr, tokenIn, tokenOut, shuffled[0].amt, sMin, deadline, feeTier)
                    } else {
                        const chunkAmts = shuffled.map(c => c.amt)

                        // ALWAYS BATCH logic
                        let minVal = parseUnits(chunkAmts[0], tokenIn.decimals)
                        let minAmtStr = chunkAmts[0]

                        for (let i = 1; i < chunkAmts.length; i++) {
                            const val = parseUnits(chunkAmts[i], tokenIn.decimals)
                            if (val < minVal) {
                                minVal = val
                                minAmtStr = chunkAmts[i]
                            }
                        }

                        const sQuote = await getQuote(tokenIn.address, tokenOut.address, minAmtStr, tokenIn.decimals, tokenOut.decimals, feeTier)
                        const minOutPerTrade = (parseFloat(sQuote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)

                        return executeBatchTrade(
                            shuffled.map(c => c.addr),
                            tokenIn,
                            tokenOut,
                            chunkAmts,
                            minOutPerTrade,
                            deadline,
                            feeTier
                        )
                    }
                })
            )
        }

        // Execute all chunks concurrently
        const results = await Promise.allSettled(chunkPromises)

        const txHashes: string[] = []
        let successCount = 0
        let totalActualOut = 0
        let failedError: string | undefined

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.success) {
                successCount++
                if (result.value.txHash) txHashes.push(result.value.txHash)
                if (result.value.amountOut) {
                    totalActualOut += parseFloat(result.value.amountOut)
                } else {
                    totalActualOut += parseFloat(quote) // Use quote as fallback per chunk
                }
            } else if (result.status === 'fulfilled' && !result.value.success) {
                failedError = result.value.error
            } else if (result.status === 'rejected') {
                failedError = result.reason?.message || 'Chunk execution failed'
            }
        }

        const allSuccess = successCount === chunks
        const executedVolume = parseFloat(aggregateChunkAmount) * successCount

        // Calculate slippage metrics
        const expectedForExecuted = (parseFloat(totalExpectedQuote) / chunks) * successCount
        const realizedSlip = expectedForExecuted > 0
            ? calculateRealizedSlippage(expectedForExecuted.toString(), totalActualOut.toString())
            : 0
        const priceImpact = totalActualOut > 0 ? calculatePriceImpact(executedVolume.toString(), totalActualOut.toString(), spotPrice) : 0

        // Build slippage analysis for A/B testing
        const slippageAnalysis = totalActualOut > 0 ? buildSlippageAnalysis(
            executedVolume.toString(),
            expectedForExecuted.toString(),
            totalActualOut.toString(),
            false // Smart Market is NOT concurrent
        ) : undefined

        updateOrderState({
            status: allSuccess ? 'filled' : successCount > 0 ? 'partial' : 'failed',
            progress: Math.round((successCount / chunks) * 100),
            executedSlices: successCount,
            totalSlices: chunks,
            executedVolume: executedVolume.toString(),
            txHashes,
            actualAmountOut: totalActualOut.toString(),
            realizedSlippage: realizedSlip,
            priceImpact,
            slippageAnalysis,
            error: allSuccess ? undefined : failedError,
        })

        if (!allSuccess && successCount === 0) {
            throw new Error(failedError || 'All chunks failed')
        }

        return allSuccess
    }, [getQuote, getBestQuote, executeSingleTrade, executeBatchTrade, updateOrderState, calculateOrderAmounts])

    // -------------------------------------------------------------------------
    // SMART TWAP ORDER (TWAP + Chunking)
    // -------------------------------------------------------------------------

    const executeSmartTWAPOrder = useCallback(async (params: OrderParams): Promise<boolean> => {
        const {
            clientAddresses,
            tokenIn,
            tokenOut,
            totalAmount,
            slippage,
            slices = 4,
            durationMinutes = 10,
            chunks = 2,
            amountMode = 'fixed'
        } = params

        // 1. Calculate TOTAL amounts for each client
        const totalAmountsPerClient = await calculateOrderAmounts(clientAddresses, tokenIn, totalAmount, amountMode)

        // 2. Aggregate Total (for stats)
        const aggregateTotal = totalAmountsPerClient.reduce((acc, val) => acc + parseFloat(val), 0).toString()

        // 3. Slice Amounts
        const sliceAmountsPerClient = totalAmountsPerClient.map(total => (parseFloat(total) / slices).toFixed(tokenIn.decimals))
        const aggregateSliceAmount = (parseFloat(aggregateTotal) / slices).toFixed(tokenIn.decimals)

        // 4. Chunk Amounts
        const chunkAmountsPerClient = sliceAmountsPerClient.map(slice => (parseFloat(slice) / chunks).toFixed(tokenIn.decimals))
        const aggregateChunkAmount = (parseFloat(aggregateSliceAmount) / chunks).toFixed(tokenIn.decimals)

        const intervalMs = (durationMinutes * 60 * 1000) / slices
        const deadline = Math.floor(Date.now() / 1000) + (durationMinutes * 60) + 600

        // Get total expected output AND FEE TIER
        const { amountOut: totalExpectedQuote, feeTier } = await getBestQuote(tokenIn.address, tokenOut.address, totalAmount, tokenIn.decimals, tokenOut.decimals)

        if (totalExpectedQuote === '0') throw new Error('No liquidity found for Smart TWAP trade')

        // Get spot price for price impact calculation
        const spotQuote = await getQuote(tokenIn.address, tokenOut.address, '1', tokenIn.decimals, tokenOut.decimals, feeTier)
        const spotPrice = spotQuote !== '0' ? (1 / parseFloat(spotQuote)).toString() : '0'

        updateOrderState({
            expectedAmountOut: totalExpectedQuote,
            testMetadata: {
                assignedAt: new Date(),
                slippageSetting: slippage,
                marketConditions: { spotPrice }
            }
        })

        let completedSlices = 0
        let failedChunks = 0
        let totalExecutedVolume = 0
        let totalActualOut = 0
        const allTxHashes: string[] = []
        const errors: string[] = []

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
                // Need to pair clients with their chunk amounts for this slice
                const clientsWithAmounts = clientAddresses.map((addr, idx) => ({ addr, amt: chunkAmountsPerClient[idx] }))
                const shuffled = shuffleArray(clientsWithAmounts)

                chunkPromises.push(
                    sleep(jitterMs).then(async () => {
                        if (shuffled.length === 1) {
                            // Find quote for this specific single trade
                            const sQuote = await getQuote(tokenIn.address, tokenOut.address, shuffled[0].amt, tokenIn.decimals, tokenOut.decimals, feeTier)
                            const sMin = (parseFloat(sQuote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)
                            return executeSingleTrade(shuffled[0].addr, tokenIn, tokenOut, shuffled[0].amt, sMin, deadline, feeTier)
                        } else {
                            // ALWAYS BATCH logic for chunk
                            // Find minimum amount in this chunk set
                            let minVal = parseUnits(shuffled[0].amt, tokenIn.decimals)
                            let minAmtStr = shuffled[0].amt

                            for (let i = 1; i < shuffled.length; i++) {
                                const val = parseUnits(shuffled[i].amt, tokenIn.decimals)
                                if (val < minVal) {
                                    minVal = val
                                    minAmtStr = shuffled[i].amt
                                }
                            }

                            // Calc safe minOut based on smallest trade in the chunk
                            const sQuote = await getQuote(tokenIn.address, tokenOut.address, minAmtStr, tokenIn.decimals, tokenOut.decimals, feeTier)
                            const minOutPerTrade = (parseFloat(sQuote) * (1 - slippage / 100)).toFixed(tokenOut.decimals)

                            return executeBatchTrade(
                                shuffled.map(c => c.addr),
                                tokenIn,
                                tokenOut,
                                shuffled.map(c => c.amt),
                                minOutPerTrade,
                                deadline,
                                feeTier
                            )
                        }
                    })
                )
            }

            const results = await Promise.allSettled(chunkPromises)

            let sliceSuccess = 0
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value.success) {
                    sliceSuccess++
                    totalExecutedVolume += parseFloat(aggregateChunkAmount)
                    if (result.value.txHash) allTxHashes.push(result.value.txHash)
                    if (result.value.amountOut) {
                        totalActualOut += parseFloat(result.value.amountOut)
                    }
                } else {
                    failedChunks++
                    const errMsg = result.status === 'fulfilled'
                        ? result.value.error
                        : result.reason?.message
                    if (errMsg) errors.push(`Slice ${sliceIdx + 1}: ${errMsg}`)
                }
            }

            if (sliceSuccess > 0) completedSlices++

            // Calculate running slippage metrics
            const totalChunksProcessed = (sliceIdx + 1) * chunks
            const expectedForProcessed = (parseFloat(totalExpectedQuote) / (slices * chunks)) * (totalChunksProcessed - failedChunks)
            const realizedSlip = expectedForProcessed > 0 ? calculateRealizedSlippage(expectedForProcessed.toString(), totalActualOut.toString()) : 0

            const successfulChunks = totalChunksProcessed - failedChunks
            const isFinalSlice = sliceIdx === slices - 1

            updateOrderState({
                status: isFinalSlice
                    ? (successfulChunks === 0 ? 'failed' : failedChunks > 0 ? 'partial' : 'filled')
                    : 'partial',
                progress: Math.round(((sliceIdx + 1) / slices) * 100),
                executedSlices: completedSlices,
                totalSlices: slices,
                executedVolume: totalExecutedVolume.toFixed(tokenIn.decimals),
                txHashes: allTxHashes,
                actualAmountOut: totalActualOut.toString(),
                realizedSlippage: realizedSlip,
                error: errors.length > 0 ? errors.slice(-3).join('; ') : undefined, // Keep last 3 errors
            })

            // Wait for next slice
            if (sliceIdx < slices - 1) {
                await sleep(intervalMs)
            }
        }

        // Final price impact calculation and slippage analysis
        if (totalActualOut > 0) {
            const priceImpact = calculatePriceImpact(totalExecutedVolume.toString(), totalActualOut.toString(), spotPrice)

            // Build slippage analysis for A/B testing
            const slippageAnalysis = buildSlippageAnalysis(
                totalExecutedVolume.toString(),
                totalExpectedQuote,
                totalActualOut.toString(),
                false // Smart TWAP is NOT concurrent
            )

            updateOrderState({ priceImpact, slippageAnalysis })
        }

        // Throw if all chunks failed
        const totalChunks = slices * chunks
        if (failedChunks === totalChunks) {
            throw new Error(errors.join('; ') || 'All chunks failed')
        }

        return failedChunks === 0
    }, [getQuote, getBestQuote, executeSingleTrade, executeBatchTrade, updateOrderState, calculateOrderAmounts])

    // -------------------------------------------------------------------------
    // MAIN EXECUTE FUNCTION
    // -------------------------------------------------------------------------

    const executeOrder = useCallback(async (params: OrderParams): Promise<OrderState> => {
        setIsExecuting(true)
        setError(null)
        cancelledRef.current = false

        const orderId = generateOrderId()
        const testGroup = assignTestGroup()

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
            testGroup,
        }

        setCurrentOrder(initialState)

        // Store initial state in localStorage
        try {
            const orders = JSON.parse(localStorage.getItem('order_engine_orders') || '[]')
            orders.unshift(initialState)
            localStorage.setItem('order_engine_orders', JSON.stringify(orders.slice(0, 2000)))
        } catch { /* ignore */ }

        let finalState: OrderState = initialState

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

            // Retrieve the final state from localStorage to ensure we return the updated state
            try {
                const orders = JSON.parse(localStorage.getItem('order_engine_orders') || '[]')
                const found = orders.find((o: any) => o.id === orderId)
                if (found) {
                    finalState = {
                        ...found,
                        createdAt: new Date(found.createdAt),
                        updatedAt: new Date(found.updatedAt),
                        testMetadata: found.testMetadata ? {
                            ...found.testMetadata,
                            assignedAt: new Date(found.testMetadata.assignedAt)
                        } : undefined
                    }
                }
            } catch { /* ignore */ }
        }

        return finalState
    }, [executeMarketOrder, executeTWAPOrder, executeSmartMarketOrder, executeSmartTWAPOrder, updateOrderState])

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
                testMetadata: o.testMetadata ? {
                    ...o.testMetadata,
                    assignedAt: new Date(o.testMetadata.assignedAt)
                } : undefined
            }))
        } catch (e) {
            console.error('Failed to load order history:', e)
            return []
        }
    }, [])

    // -------------------------------------------------------------------------
    // SLIPPAGE ANALYTICS FOR A/B TESTING
    // -------------------------------------------------------------------------

    const getSlippageAnalytics = useCallback(() => {
        const orders = getOrderHistory()
        const filledOrders = orders.filter(o => o.status === 'filled')

        // Group by test group
        const byTestGroup: Record<string, OrderState[]> = {
            A: [],
            B: [],
            control: [],
        }

        for (const order of filledOrders) {
            const group = order.testGroup || 'control'
            byTestGroup[group].push(order)
        }

        // Group by order type
        const byOrderType: Record<OrderType, OrderState[]> = {
            market: [],
            twap: [],
            smart_market: [],
            smart_twap: [],
        }

        for (const order of filledOrders) {
            byOrderType[order.params.orderType].push(order)
        }

        // Calculate metrics for a group of orders
        const calculateMetrics = (orderGroup: OrderState[]) => {
            if (orderGroup.length === 0) {
                return {
                    count: 0,
                    avgRealizedSlippage: 0,
                    avgPriceImpact: 0,
                    maxSlippage: 0,
                    minSlippage: 0,
                    successRate: 0,
                    avgSlippageSetting: 0,
                }
            }

            const slippages = orderGroup
                .filter(o => o.realizedSlippage !== undefined)
                .map(o => o.realizedSlippage!)

            const priceImpacts = orderGroup
                .filter(o => o.priceImpact !== undefined)
                .map(o => o.priceImpact!)

            const slippageSettings = orderGroup
                .filter(o => o.testMetadata?.slippageSetting !== undefined)
                .map(o => o.testMetadata!.slippageSetting)

            const fullyFilled = orderGroup.filter(o => o.status === 'filled').length

            return {
                count: orderGroup.length,
                avgRealizedSlippage: slippages.length > 0
                    ? slippages.reduce((a, b) => a + b, 0) / slippages.length
                    : 0,
                avgPriceImpact: priceImpacts.length > 0
                    ? priceImpacts.reduce((a, b) => a + b, 0) / priceImpacts.length
                    : 0,
                maxSlippage: slippages.length > 0 ? Math.max(...slippages) : 0,
                minSlippage: slippages.length > 0 ? Math.min(...slippages) : 0,
                successRate: (fullyFilled / orderGroup.length) * 100,
                avgSlippageSetting: slippageSettings.length > 0
                    ? slippageSettings.reduce((a, b) => a + b, 0) / slippageSettings.length
                    : 0,
            }
        }

        return {
            totalOrders: filledOrders.length,
            byTestGroup: {
                A: calculateMetrics(byTestGroup.A),
                B: calculateMetrics(byTestGroup.B),
                control: calculateMetrics(byTestGroup.control),
            },
            byOrderType: {
                market: calculateMetrics(byOrderType.market),
                twap: calculateMetrics(byOrderType.twap),
                smart_market: calculateMetrics(byOrderType.smart_market),
                smart_twap: calculateMetrics(byOrderType.smart_twap),
            },
            // Raw data for custom analysis - includes A/B testing fields
            rawOrders: filledOrders.map(o => ({
                id: o.id,
                orderType: o.params.orderType,
                testGroup: o.testGroup,
                slippageSetting: o.testMetadata?.slippageSetting,
                expectedAmountOut: o.expectedAmountOut,
                actualAmountOut: o.actualAmountOut,
                realizedSlippage: o.realizedSlippage,
                priceImpact: o.priceImpact,
                status: o.status,
                executedVolume: o.executedVolume,
                createdAt: o.createdAt,

                // Slippage Analysis fields for A/B testing
                // Time - Timestamp
                timestamp: o.slippageAnalysis?.timestamp || o.createdAt,
                // Fill price/swap price - Float
                fillPrice: o.slippageAnalysis?.fillPrice,
                expectedPrice: o.slippageAnalysis?.expectedPrice,
                // Concurrently/not - boolean
                isConcurrent: o.slippageAnalysis?.isConcurrent ?? (o.params.orderType === 'market' || o.params.orderType === 'twap'),
                // Quantity
                quantity: o.slippageAnalysis?.quantity || o.executedVolume,
                // Slippage in basis points
                slippageBps: o.slippageAnalysis?.slippageBps,
                priceImpactBps: o.slippageAnalysis?.priceImpactBps,
            })),
        }
    }, [getOrderHistory])

    // -------------------------------------------------------------------------
    // EXPORT ANALYTICS DATA (for external analysis)
    // -------------------------------------------------------------------------

    const exportAnalyticsData = useCallback(() => {
        const analytics = getSlippageAnalytics()
        return JSON.stringify(analytics, null, 2)
    }, [getSlippageAnalytics])

    // -------------------------------------------------------------------------
    // EXPORT ANALYTICS AS CSV (for testing/analysis before database)
    // -------------------------------------------------------------------------

    const exportAnalyticsCSV = useCallback(() => {
        const analytics = getSlippageAnalytics()

        // CSV Header
        const headers = [
            'id',
            'timestamp',
            'orderType',
            'testGroup',
            'fillPrice',
            'expectedPrice',
            'isConcurrent',
            'quantity',
            'slippageBps',
            'priceImpactBps',
            'slippageSetting',
            'expectedAmountOut',
            'actualAmountOut',
            'realizedSlippage',
            'priceImpact',
            'executedVolume',
            'status',
        ]

        // Convert raw orders to CSV rows
        const rows = analytics.rawOrders.map(order => [
            order.id,
            order.timestamp instanceof Date ? order.timestamp.toISOString() : order.timestamp,
            order.orderType,
            order.testGroup || '',
            order.fillPrice ?? '',
            order.expectedPrice ?? '',
            order.isConcurrent,
            order.quantity || '',
            order.slippageBps ?? '',
            order.priceImpactBps ?? '',
            order.slippageSetting ?? '',
            order.expectedAmountOut || '',
            order.actualAmountOut || '',
            order.realizedSlippage ?? '',
            order.priceImpact ?? '',
            order.executedVolume || '',
            order.status,
        ])

        // Build CSV string
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => {
                // Escape quotes and wrap in quotes if contains comma
                const cellStr = String(cell)
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`
                }
                return cellStr
            }).join(','))
        ].join('\n')

        return csvContent
    }, [getSlippageAnalytics])

    // -------------------------------------------------------------------------
    // DOWNLOAD CSV FILE (triggers browser download)
    // -------------------------------------------------------------------------

    const downloadAnalyticsCSV = useCallback(() => {
        const csvContent = exportAnalyticsCSV()
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `slippage_analytics_${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }, [exportAnalyticsCSV])

    // -------------------------------------------------------------------------
    // CLEAR ORDER HISTORY
    // -------------------------------------------------------------------------

    const clearOrderHistory = useCallback(() => {
        localStorage.removeItem('order_engine_orders')
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

        // Analytics for A/B Testing
        getSlippageAnalytics,
        exportAnalyticsData,
        exportAnalyticsCSV,
        downloadAnalyticsCSV,
        clearOrderHistory,

        // Constants
        FEE_TIERS,
    }
}
