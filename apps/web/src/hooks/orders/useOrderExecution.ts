import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract, BrowserProvider, parseUnits, formatUnits } from 'ethers'
import { useTradingModule } from '../useTradingModule'
import {
    FEE_TIERS,
    TRADING_MODULE_ADDRESSES,
    TRADING_MODULE_ABI,
    QUOTER_ADDRESSES,
    QUOTER_ABI,
} from '../../contracts/TradingModule'

// --- Types ---

export type OrderExecutionType = 'market' | 'twap' | 'smart_market' | 'smart_twap'
export type ChunkStatus = 'pending' | 'simulating' | 'submitting' | 'completed' | 'failed' | 'retrying'
export type TriggerCondition = 'above' | 'below' | 'none'
export type OrderScheduleStatus = 'awaiting_trigger' | 'scheduled' | 'running' | 'completed' | 'failed' | 'paused'

export interface OrderParams {
    id: string
    type: OrderExecutionType
    tokenIn: any
    tokenOut: any
    amountIn: string
    clients: any[]

    // Advanced Params
    chunks?: number
    slices?: number
    duration?: number

    // === TRIGGER SUPPORT ===
    triggerPrice?: string // e.g., "3500" USD
    triggerCondition?: TriggerCondition // 'above' | 'below' | 'none'
    timeTrigger?: string // ISO timestamp e.g., "2026-01-24T10:00:00"
    timezone?: string
    triggerOperator?: 'AND' | 'OR'

    // Internal
    createdAt: number
    status: OrderScheduleStatus
    triggeredAt?: number // When condition was met
}

interface ExecutionChunk {
    id: string
    orderId: string
    amount: string
    executeAt: number
    client: any

    status: ChunkStatus
    txHash?: string
    error?: string
    retryCount: number
    lastAttempt?: number
    isSmartChunk?: boolean
}

// --- Configuration ---

const MAX_RETRIES = 3
const BASE_RETRY_DELAY = 2000
const TRIGGER_CHECK_INTERVAL = 10000 // Check triggers every 10s

export function useOrderExecution() {
    const { executeTrade, getQuote } = useTradingModule()

    // State
    const [activeOrders, setActiveOrders] = useState<OrderParams[]>([])
    const [executionQueue, setExecutionQueue] = useState<ExecutionChunk[]>([])
    const [logs, setLogs] = useState<string[]>([])
    const [currentPrices, setCurrentPrices] = useState<Record<string, string>>({})
    const isProcessing = useRef(false)
    const isTriggerChecking = useRef(false)

    // --- Persistence ---

    useEffect(() => {
        const saved = localStorage.getItem('safe_advanced_orders_v3')
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                setActiveOrders(parsed.orders || [])
                setExecutionQueue(parsed.queue || [])
                addLog('Restored state from persistence.')
            } catch (e) {
                console.error('Failed to load orders', e)
            }
        }
    }, [])

    useEffect(() => {
        localStorage.setItem(
            'safe_advanced_orders_v3',
            JSON.stringify({
                orders: activeOrders,
                queue: executionQueue,
            }),
        )
    }, [activeOrders, executionQueue])

    const addLog = useCallback((msg: string) => {
        console.log(`[OrderEngine] ${msg}`)
        setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100))
    }, [])

    // --- Helpers ---

    const updateOrder = useCallback((orderId: string, updates: Partial<OrderParams>) => {
        setActiveOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)))
    }, [])

    const updateChunk = useCallback((chunkId: string, updates: Partial<ExecutionChunk>) => {
        setExecutionQueue((prev) => prev.map((c) => (c.id === chunkId ? { ...c, ...updates } : c)))
    }, [])

    const getContract = useCallback(async (signer = false) => {
        if (!window.ethereum) throw new Error('No Wallet')
        const provider = new BrowserProvider(window.ethereum as any)
        const network = await provider.getNetwork()
        const chainId = Number(network.chainId)
        const address = TRADING_MODULE_ADDRESSES[chainId] || TRADING_MODULE_ADDRESSES[11155111]
        return new Contract(address, TRADING_MODULE_ABI, signer ? await provider.getSigner() : provider)
    }, [])

    // --- Price Feed (for Trigger Monitoring) ---

    const fetchCurrentPrice = useCallback(
        async (tokenIn: any, tokenOut: any): Promise<string> => {
            try {
                // Use Uniswap Quoter: Get price for 1 unit of tokenIn
                const quote = await getQuote(
                    tokenIn.address,
                    tokenOut.address,
                    '1',
                    FEE_TIERS.MEDIUM,
                    tokenIn.decimals,
                    tokenOut.decimals,
                )
                return quote
            } catch (e) {
                console.warn('Price fetch failed', e)
                return '0'
            }
        },
        [getQuote],
    )

    // --- Core: Trigger Condition Check ---

    const checkTriggerCondition = useCallback(
        (order: OrderParams, currentPrice: string): boolean => {
            const operator = order.triggerOperator || 'AND'

            // --- Condition 1: Time ---
            let timeMet = true
            let timeDefined = false
            if (order.timeTrigger) {
                timeDefined = true
                const triggerTime = new Date(order.timeTrigger).getTime()
                timeMet = Date.now() >= triggerTime
            }

            // --- Condition 2: Price ---
            let priceMet = true
            let priceDefined = false
            if (order.triggerPrice && order.triggerCondition && order.triggerCondition !== 'none') {
                priceDefined = true
                const price = parseFloat(currentPrice)
                const target = parseFloat(order.triggerPrice)

                if (order.triggerCondition === 'above') priceMet = price >= target
                else if (order.triggerCondition === 'below') priceMet = price <= target
            }

            // --- Logic ---
            if (operator === 'OR') {
                // If ONE is defined and met, return true. 
                // If BOTH defined, either met returns true.
                if (timeDefined && priceDefined) return timeMet || priceMet
                if (timeDefined) return timeMet
                if (priceDefined) return priceMet
                return true // No triggers defined? Treat as ready.
            } else {
                // AND: All defined triggers must be met.
                const timeCondition = !timeDefined || timeMet
                const priceCondition = !priceDefined || priceMet
                return timeCondition && priceCondition
            }
        },
        [],
    )

    // --- Core: Simulation (Pre-Flight) ---

    const simulateChunk = useCallback(
        async (chunk: ExecutionChunk) => {
            addLog(`Simulating Chunk ${chunk.id.split('-').pop()}...`)
            try {
                const order = activeOrders.find((o) => o.id === chunk.orderId)
                if (!order) throw new Error('Order not found')

                const contract = await getContract(false)
                const params = {
                    safe: chunk.client.address,
                    tokenIn: order.tokenIn.address,
                    tokenOut: order.tokenOut.address,
                    amountIn: parseUnits(chunk.amount, order.tokenIn.decimals),
                    minAmountOut: 0n,
                    feeTier: FEE_TIERS.MEDIUM,
                    deadline: Math.floor(Date.now() / 1000) + 300,
                }
                await contract.executeTrade.staticCall(params)
                return true
            } catch (err: any) {
                console.warn('Simulation Failed:', err)
                throw new Error(err.reason || err.message || 'Simulation Failed')
            }
        },
        [activeOrders, getContract, addLog],
    )

    // --- Scheduler: Generate Chunks for an Order ---

    const generateChunksForOrder = useCallback(
        (params: OrderParams): ExecutionChunk[] => {
            const newChunks: ExecutionChunk[] = []
            const totalAmount = parseFloat(params.amountIn)
            const now = Date.now()

            if (params.type === 'smart_market') {
                const chunks = params.chunks || 5
                params.clients.forEach((client) => {
                    let remaining = totalAmount
                    for (let i = 0; i < chunks - 1; i++) {
                        const avg = remaining / (chunks - i)
                        const size = avg + (Math.random() * avg * 0.8 - avg * 0.4)
                        const jitter = Math.random() * 30000 + i * 2000
                        newChunks.push({
                            id: `${params.id}-${i}-${client.address.slice(0, 4)}`,
                            orderId: params.id,
                            amount: size.toFixed(params.tokenIn.decimals),
                            executeAt: now + jitter,
                            client,
                            status: 'pending',
                            retryCount: 0,
                            isSmartChunk: true,
                        })
                        remaining -= size
                    }
                    newChunks.push({
                        id: `${params.id}-last-${client.address.slice(0, 4)}`,
                        orderId: params.id,
                        amount: remaining.toFixed(params.tokenIn.decimals),
                        executeAt: now + 35000,
                        client,
                        status: 'pending',
                        retryCount: 0,
                        isSmartChunk: true,
                    })
                })
            } else if (params.type === 'twap') {
                const slices = params.slices || 1
                const interval = ((params.duration || 10) * 60 * 1000) / slices
                const size = totalAmount / slices

                for (let i = 0; i < slices; i++) {
                    params.clients.forEach((c) => {
                        newChunks.push({
                            id: `${params.id}-twap-${i}-${c.address.slice(0, 4)}`,
                            orderId: params.id,
                            amount: size.toFixed(params.tokenIn.decimals),
                            executeAt: now + interval * i,
                            client: c,
                            status: 'pending',
                            retryCount: 0,
                        })
                    })
                }
            } else if (params.type === 'smart_twap') {
                const slices = params.slices || 1
                const chunksPerSlice = params.chunks || 3
                const interval = ((params.duration || 10) * 60 * 1000) / slices
                const sliceSize = totalAmount / slices

                for (let i = 0; i < slices; i++) {
                    const sliceTime = now + interval * i
                    params.clients.forEach((client) => {
                        let remaining = sliceSize
                        for (let c = 0; c < chunksPerSlice - 1; c++) {
                            const avg = remaining / (chunksPerSlice - c)
                            const size = avg + (Math.random() * avg * 0.8 - avg * 0.4)
                            const subJitter = Math.random() * (interval * 0.8)
                            newChunks.push({
                                id: `${params.id}-slice-${i}-sub-${c}-${client.address.slice(0, 4)}`,
                                orderId: params.id,
                                amount: size.toFixed(params.tokenIn.decimals),
                                executeAt: sliceTime + subJitter,
                                client,
                                status: 'pending',
                                retryCount: 0,
                                isSmartChunk: true,
                            })
                            remaining -= size
                        }
                        newChunks.push({
                            id: `${params.id}-slice-${i}-sub-last-${client.address.slice(0, 4)}`,
                            orderId: params.id,
                            amount: remaining.toFixed(params.tokenIn.decimals),
                            executeAt: sliceTime + interval * 0.9,
                            client,
                            status: 'pending',
                            retryCount: 0,
                            isSmartChunk: true,
                        })
                    })
                }
            } else {
                // Market fallback
                params.clients.forEach((c) => {
                    newChunks.push({
                        id: `${params.id}-mkt-${c.address.slice(0, 4)}`,
                        orderId: params.id,
                        amount: params.amountIn,
                        executeAt: now,
                        client: c,
                        status: 'pending',
                        retryCount: 0,
                    })
                })
            }

            return newChunks
        },
        [],
    )

    // --- Schedule Order (Called from UI) ---

    const scheduleOrder = useCallback(
        (params: OrderParams) => {
            addLog(`Received order: ${params.type}`)

            // Check if order has triggers
            const hasTrigger =
                (params.triggerPrice && params.triggerCondition && params.triggerCondition !== 'none') ||
                params.timeTrigger

            if (hasTrigger) {
                // Store as awaiting_trigger - do NOT generate chunks yet
                const orderWithStatus = { ...params, status: 'awaiting_trigger' as OrderScheduleStatus }
                setActiveOrders((prev) => [...prev, orderWithStatus])
                addLog(`⏳ Order ${params.id.slice(-4)} is awaiting trigger conditions`)
            } else {
                // No triggers - schedule immediately
                const newChunks = generateChunksForOrder(params)
                const orderWithStatus = { ...params, status: 'scheduled' as OrderScheduleStatus }
                setActiveOrders((prev) => [...prev, orderWithStatus])
                setExecutionQueue((prev) => [...prev, ...newChunks].sort((a, b) => a.executeAt - b.executeAt))
                addLog(`Scheduled ${newChunks.length} chunks immediately`)
            }
        },
        [generateChunksForOrder, addLog],
    )

    // --- TRIGGER MONITORING LOOP ---

    useEffect(() => {
        const checkTriggers = async () => {
            if (isTriggerChecking.current) return
            isTriggerChecking.current = true

            const awaitingOrders = activeOrders.filter((o) => o.status === 'awaiting_trigger')

            if (awaitingOrders.length > 0) {
                addLog(`🔍 Checking ${awaitingOrders.length} trigger(s)...`)
            }

            for (const order of awaitingOrders) {
                // Fetch current price if needed
                let currentPrice = '0'
                if (order.triggerPrice && order.triggerCondition !== 'none') {
                    currentPrice = await fetchCurrentPrice(order.tokenIn, order.tokenOut)
                    setCurrentPrices((prev) => ({ ...prev, [order.id]: currentPrice }))
                    addLog(`Price for ${order.tokenIn.symbol}/${order.tokenOut.symbol}: ${currentPrice}`)
                }

                // Check condition
                const conditionMet = checkTriggerCondition(order, currentPrice)

                addLog(`Order ${order.id.slice(-4)}: Price=${currentPrice}, Target=${order.triggerPrice || 'N/A'}, Time=${order.timeTrigger || 'N/A'}, Met=${conditionMet}`)

                if (conditionMet) {
                    addLog(`✅ Trigger met for order ${order.id.slice(-4)}! Scheduling execution...`)

                    // Generate chunks NOW
                    const newChunks = generateChunksForOrder(order)

                    // Update order status
                    updateOrder(order.id, { status: 'scheduled', triggeredAt: Date.now() })

                    // Add chunks to queue
                    setExecutionQueue((prev) => [...prev, ...newChunks].sort((a, b) => a.executeAt - b.executeAt))

                    addLog(`🚀 Trigger activated: ${newChunks.length} chunks scheduled`)
                }
            }

            isTriggerChecking.current = false
        }

        // Run immediately on mount/change
        checkTriggers()

        // Then continue checking at interval
        const interval = setInterval(checkTriggers, TRIGGER_CHECK_INTERVAL)
        return () => clearInterval(interval)
    }, [activeOrders, fetchCurrentPrice, checkTriggerCondition, generateChunksForOrder, updateOrder, addLog])

    // --- EXECUTION LOOP (Same as before) ---

    useEffect(() => {
        const processQueue = async () => {
            if (isProcessing.current) return

            const now = Date.now()
            const candidates = executionQueue.filter(
                (c) =>
                    (c.status === 'pending' || c.status === 'retrying' || c.status === 'simulating') &&
                    c.executeAt <= now,
            )

            if (candidates.length === 0) return

            isProcessing.current = true

            for (const chunk of candidates) {
                if (chunk.status === 'retrying') {
                    const delay = BASE_RETRY_DELAY * Math.pow(2, chunk.retryCount)
                    if (now - (chunk.lastAttempt || 0) < delay) continue
                }

                // 1. SIMULATION
                if (chunk.status === 'pending' || chunk.status === 'retrying') {
                    updateChunk(chunk.id, { status: 'simulating' })
                    try {
                        await simulateChunk(chunk)
                        updateChunk(chunk.id, { status: 'submitting' })
                    } catch (err: any) {
                        addLog(`Simulation Failed: ${err.message}`)
                        updateChunk(chunk.id, { status: 'failed', error: err.message })
                        continue
                    }
                }

                // 2. SUBMISSION
                addLog(`Submitting Chunk ${chunk.id.split('-').pop()}...`)
                try {
                    const order = activeOrders.find((o) => o.id === chunk.orderId)
                    if (!order) throw new Error('Order Missing')

                    const txHash = await executeTrade({
                        safe: chunk.client.address,
                        tokenIn: order.tokenIn.address,
                        tokenOut: order.tokenOut.address,
                        amountIn: chunk.amount,
                        minAmountOut: '0',
                        feeTier: FEE_TIERS.MEDIUM,
                        deadline: Math.floor(Date.now() / 1000) + 600,
                        tokenInDecimals: order.tokenIn.decimals,
                        tokenOutDecimals: order.tokenOut.decimals,
                    })

                    addLog(`Confirmed: ${txHash.slice(0, 10)}...`)
                    updateChunk(chunk.id, { status: 'completed', txHash })
                } catch (err: any) {
                    console.error(err)
                    const nextRetry = chunk.retryCount + 1

                    if (nextRetry > MAX_RETRIES) {
                        addLog(`Failed after ${MAX_RETRIES} retries.`)
                        updateChunk(chunk.id, { status: 'failed', error: err.message })
                    } else {
                        addLog(`Failed. Retrying (${nextRetry}/${MAX_RETRIES})...`)
                        updateChunk(chunk.id, {
                            status: 'retrying',
                            retryCount: nextRetry,
                            lastAttempt: Date.now(),
                            error: err.message,
                        })
                    }
                }
            }

            isProcessing.current = false
        }

        const interval = setInterval(processQueue, 2000)
        return () => clearInterval(interval)
    }, [executionQueue, activeOrders, executeTrade, simulateChunk, updateChunk, addLog])

    // --- Cancel Order ---

    const cancelOrder = useCallback(
        (orderId: string) => {
            addLog(`Cancelling order ${orderId.slice(-4)}`)
            updateOrder(orderId, { status: 'paused' })
            // Remove pending chunks
            setExecutionQueue((prev) =>
                prev.filter((c) => c.orderId !== orderId || c.status === 'completed'),
            )
        },
        [updateOrder, addLog],
    )

    return {
        scheduleOrder,
        cancelOrder,
        activeOrders,
        executionQueue,
        logs,
        currentPrices,
    }
}

