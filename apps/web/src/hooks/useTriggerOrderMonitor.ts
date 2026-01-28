'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTradingModule } from './useTradingModule'
import { useOrderEngine, type OrderParams, type OrderType } from './useOrderEngine'
import { TOKENS_BY_CHAIN, FEE_TIERS } from '../contracts/TradingModule'

// =============================================================================
// TYPES
// =============================================================================

export interface TriggerOrder {
    id: string
    type: OrderType
    clientAddresses: string[]
    tokenIn: string
    tokenOut: string
    amountIn: string
    slippage: number
    triggerPrice?: string
    triggerCondition?: 'above' | 'below'
    timeTrigger?: string
    timezone?: string
    triggerOperator?: 'AND' | 'OR'
    chunks?: number
    slices?: number
    durationMinutes?: number
    status: 'pending' | 'triggered' | 'executing' | 'filled' | 'cancelled' | 'failed'
    createdAt: string
    triggeredAt?: string
    error?: string
    // Gelato integration
    useGelato?: boolean
    gelatoTaskId?: string
}

const TRIGGER_ORDERS_KEY = 'trading_trigger_orders'
const MONITOR_INTERVAL_MS = 10000 // Check every 10 seconds

// =============================================================================
// TIMEZONE UTILITIES
// =============================================================================

const TIMEZONE_OFFSETS: Record<string, number> = {
    'UTC': 0,
    'GMT': 0,
    'EST': -5,
    'CST': -6,
    'MST': -7,
    'PST': -8,
    'IST': 5.5,
    'CET': 1,
    'JST': 9,
    'AEST': 10,
}

function parseTimeWithTimezone(timeStr: string, timezone: string): Date {
    const date = new Date(timeStr)
    const offset = TIMEZONE_OFFSETS[timezone] || 0
    // Adjust for timezone (timeStr is interpreted as local, we need to convert)
    const utcTime = date.getTime() - (offset * 60 * 60 * 1000)
    return new Date(utcTime)
}

// =============================================================================
// TRIGGER ORDER MONITOR HOOK
// =============================================================================

export function useTriggerOrderMonitor(chainId: number = 42161) {
    const [triggerOrders, setTriggerOrders] = useState<TriggerOrder[]>([])
    const [isMonitoring, setIsMonitoring] = useState(false)
    const [lastCheck, setLastCheck] = useState<Date | null>(null)

    const { getQuote } = useTradingModule()
    const { executeOrder } = useOrderEngine()

    const monitorIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const isExecutingRef = useRef<Set<string>>(new Set())

    // Load trigger orders from localStorage
    const loadTriggerOrders = useCallback(() => {
        try {
            const stored = localStorage.getItem(TRIGGER_ORDERS_KEY)
            if (stored) {
                const orders = JSON.parse(stored)
                setTriggerOrders(orders)
                return orders as TriggerOrder[]
            }
        } catch (e) {
            console.error('Failed to load trigger orders:', e)
        }
        return []
    }, [])

    // Save trigger orders to localStorage
    const saveTriggerOrders = useCallback((orders: TriggerOrder[]) => {
        try {
            localStorage.setItem(TRIGGER_ORDERS_KEY, JSON.stringify(orders))
            setTriggerOrders(orders)
        } catch (e) {
            console.error('Failed to save trigger orders:', e)
        }
    }, [])

    // Update a single trigger order
    const updateTriggerOrder = useCallback((id: string, updates: Partial<TriggerOrder>) => {
        const orders = loadTriggerOrders()
        const idx = orders.findIndex(o => o.id === id)
        if (idx >= 0) {
            orders[idx] = { ...orders[idx], ...updates }
            saveTriggerOrders(orders)
        }
    }, [loadTriggerOrders, saveTriggerOrders])

    // Get current price for a token pair
    const getCurrentPrice = useCallback(async (
        tokenInSymbol: string,
        tokenOutSymbol: string
    ): Promise<number> => {
        const tokens = TOKENS_BY_CHAIN[chainId]
        if (!tokens) return 0

        const tokenIn = tokens[tokenInSymbol]
        const tokenOut = tokens[tokenOutSymbol]
        if (!tokenIn || !tokenOut) return 0

        try {
            const quote = await getQuote(
                tokenIn.address,
                tokenOut.address,
                '1',
                FEE_TIERS.MEDIUM,
                tokenIn.decimals,
                tokenOut.decimals
            )
            return parseFloat(quote)
        } catch {
            return 0
        }
    }, [chainId, getQuote])

    // Check if price trigger condition is met
    const checkPriceTrigger = useCallback(async (order: TriggerOrder): Promise<boolean> => {
        if (!order.triggerPrice || !order.triggerCondition) return true // No price trigger

        const currentPrice = await getCurrentPrice(order.tokenIn, order.tokenOut)
        if (currentPrice === 0) return false

        const targetPrice = parseFloat(order.triggerPrice)

        if (order.triggerCondition === 'above') {
            return currentPrice >= targetPrice
        } else {
            return currentPrice <= targetPrice
        }
    }, [getCurrentPrice])

    // Check if time trigger condition is met
    const checkTimeTrigger = useCallback((order: TriggerOrder): boolean => {
        if (!order.timeTrigger) return true // No time trigger

        const triggerTime = parseTimeWithTimezone(order.timeTrigger, order.timezone || 'UTC')
        const now = new Date()

        return now >= triggerTime
    }, [])

    // Check if order should be triggered
    const shouldTrigger = useCallback(async (order: TriggerOrder): Promise<boolean> => {
        const hasPriceTrigger = !!order.triggerPrice
        const hasTimeTrigger = !!order.timeTrigger

        if (!hasPriceTrigger && !hasTimeTrigger) return false // No triggers set

        const priceMet = await checkPriceTrigger(order)
        const timeMet = checkTimeTrigger(order)

        // Apply trigger operator
        if (hasPriceTrigger && hasTimeTrigger) {
            if (order.triggerOperator === 'AND') {
                return priceMet && timeMet
            } else {
                return priceMet || timeMet
            }
        }

        // Single trigger
        if (hasPriceTrigger) return priceMet
        if (hasTimeTrigger) return timeMet

        return false
    }, [checkPriceTrigger, checkTimeTrigger])

    // Execute a triggered order
    const executeTriggerOrder = useCallback(async (order: TriggerOrder) => {
        // Prevent duplicate execution
        if (isExecutingRef.current.has(order.id)) return
        isExecutingRef.current.add(order.id)

        try {
            // Mark as executing
            updateTriggerOrder(order.id, {
                status: 'executing',
                triggeredAt: new Date().toISOString()
            })

            // Get token info
            const tokens = TOKENS_BY_CHAIN[chainId]
            if (!tokens) throw new Error('Chain not supported')

            const tokenIn = tokens[order.tokenIn]
            const tokenOut = tokens[order.tokenOut]
            if (!tokenIn || !tokenOut) throw new Error('Token not found')

            // Build order params
            const params: OrderParams = {
                orderType: order.type,
                clientAddresses: order.clientAddresses,
                tokenIn,
                tokenOut,
                totalAmount: order.amountIn,
                slippage: order.slippage || 1.0,
                chunks: order.chunks,
                slices: order.slices,
                durationMinutes: order.durationMinutes,
            }

            // Execute the order
            const result = await executeOrder(params)

            // Update trigger order status based on result
            updateTriggerOrder(order.id, {
                status: result.status === 'filled' ? 'filled' : result.status === 'partial' ? 'filled' : 'failed',
                error: result.error,
            })

        } catch (err: any) {
            updateTriggerOrder(order.id, {
                status: 'failed',
                error: err.message || 'Execution failed'
            })
        } finally {
            isExecutingRef.current.delete(order.id)
        }
    }, [chainId, executeOrder, updateTriggerOrder])

    // Main monitoring loop
    const checkTriggers = useCallback(async () => {
        const orders = loadTriggerOrders()
        const pendingOrders = orders.filter(o => o.status === 'pending')

        for (const order of pendingOrders) {
            try {
                const triggered = await shouldTrigger(order)
                if (triggered) {
                    // Mark as triggered and execute
                    updateTriggerOrder(order.id, { status: 'triggered' })
                    executeTriggerOrder(order)
                }
            } catch (err) {
                console.error(`Error checking trigger for order ${order.id}:`, err)
            }
        }

        setLastCheck(new Date())
    }, [loadTriggerOrders, shouldTrigger, updateTriggerOrder, executeTriggerOrder])

    // Start monitoring
    const startMonitoring = useCallback(() => {
        if (monitorIntervalRef.current) return // Already monitoring

        setIsMonitoring(true)
        checkTriggers() // Check immediately

        monitorIntervalRef.current = setInterval(() => {
            checkTriggers()
        }, MONITOR_INTERVAL_MS)
    }, [checkTriggers])

    // Stop monitoring
    const stopMonitoring = useCallback(() => {
        if (monitorIntervalRef.current) {
            clearInterval(monitorIntervalRef.current)
            monitorIntervalRef.current = null
        }
        setIsMonitoring(false)
    }, [])

    // Add a new trigger order
    const addTriggerOrder = useCallback((order: Omit<TriggerOrder, 'id' | 'status' | 'createdAt'>) => {
        const newOrder: TriggerOrder = {
            ...order,
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            status: 'pending',
            createdAt: new Date().toISOString(),
        }

        const orders = loadTriggerOrders()
        orders.unshift(newOrder)
        saveTriggerOrders(orders)

        return newOrder
    }, [loadTriggerOrders, saveTriggerOrders])

    // Cancel a trigger order
    const cancelTriggerOrder = useCallback((id: string) => {
        updateTriggerOrder(id, { status: 'cancelled' })
    }, [updateTriggerOrder])

    // Delete a trigger order
    const deleteTriggerOrder = useCallback((id: string) => {
        const orders = loadTriggerOrders()
        const filtered = orders.filter(o => o.id !== id)
        saveTriggerOrders(filtered)
    }, [loadTriggerOrders, saveTriggerOrders])

    // Load orders on mount
    useEffect(() => {
        loadTriggerOrders()
    }, [loadTriggerOrders])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (monitorIntervalRef.current) {
                clearInterval(monitorIntervalRef.current)
            }
        }
    }, [])

    return {
        // State
        triggerOrders,
        isMonitoring,
        lastCheck,

        // Actions
        startMonitoring,
        stopMonitoring,
        checkTriggers,
        addTriggerOrder,
        cancelTriggerOrder,
        deleteTriggerOrder,
        loadTriggerOrders,

        // Utilities
        getCurrentPrice,
    }
}
