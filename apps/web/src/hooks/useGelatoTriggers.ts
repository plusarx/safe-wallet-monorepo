'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { GelatoRelay } from '@gelatonetwork/relay-sdk'
import type { CallWithSyncFeeRequest } from '@gelatonetwork/relay-sdk'
import { isChainSupported } from '../config/gelatoConfig'
import { TOKENS_BY_CHAIN, FEE_TIERS, TRADING_MODULE_ADDRESSES, TRADING_MODULE_ABI, QUOTER_ADDRESSES, QUOTER_ABI } from '../contracts/TradingModule'
import { BrowserProvider, parseUnits, formatUnits, Interface, Contract } from 'ethers'
import type { TriggerOrder } from './useTriggerOrderMonitor'

// =============================================================================
// TYPES
// =============================================================================

export interface GelatoTask {
    taskId: string
    orderId: string
    status: 'pending' | 'active' | 'executing' | 'completed' | 'cancelled' | 'failed'
    createdAt: string
    triggerType: 'time' | 'price' | 'both'
    triggerCondition?: {
        price?: {
            value: string
            condition: 'above' | 'below'
        }
        time?: string
    }
    // Store EIP-712 Signature and Params
    tradeSignature?: string
    tradeParams?: {
        safe: string
        tokenIn: string
        tokenOut: string
        amountIn: string
        minAmountOut: string
        feeTier: number
        deadline: string // uint256 string
    }
    executionData?: {
        txHash?: string
        gasUsed?: string
        error?: string
        relayTaskId?: string
    }
}

const GELATO_TASKS_KEY = 'gelato_trigger_tasks_v3'

// =============================================================================
// HOOK
// =============================================================================

export function useGelatoTriggers(chainId: number = 42161) {
    const [gelatoTasks, setGelatoTasks] = useState<GelatoTask[]>([])
    const [isInitialized, setIsInitialized] = useState(false)
    const [relay, setRelay] = useState<GelatoRelay | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const monitorIntervalRef = useRef<NodeJS.Timeout | null>(null)

    // Task persistence
    const loadTasks = useCallback((): GelatoTask[] => {
        try {
            const stored = localStorage.getItem(GELATO_TASKS_KEY)
            return stored ? JSON.parse(stored) : []
        } catch {
            return []
        }
    }, [])

    const saveTasks = useCallback((tasks: GelatoTask[]) => {
        localStorage.setItem(GELATO_TASKS_KEY, JSON.stringify(tasks))
        setGelatoTasks(tasks)
    }, [])

    const updateTask = useCallback((taskId: string, updates: Partial<GelatoTask>) => {
        const tasks = loadTasks()
        const idx = tasks.findIndex(t => t.taskId === taskId)
        if (idx !== -1) {
            tasks[idx] = { ...tasks[idx], ...updates }
            saveTasks(tasks)
        }
    }, [loadTasks, saveTasks])

    // Initialize Gelato Relay client
    useEffect(() => {
        if (!isChainSupported(chainId)) {
            console.warn(`[Gelato] Chain ${chainId} not supported`)
            return
        }

        try {
            const relayClient = new GelatoRelay()
            setRelay(relayClient)
            setIsInitialized(true)
            console.log('[Gelato] Relay client initialized for chain:', chainId)

            // Load existing tasks
            const tasks = loadTasks()
            setGelatoTasks(tasks)
        } catch (err) {
            console.error('[Gelato] Failed to initialize relay client:', err)
        }
    }, [chainId, loadTasks])

    /**
     * Create autonomous trigger order using EIP-712 Signature
     */
    const createAutonomousTrigger = useCallback(async (
        order: Omit<TriggerOrder, 'status' | 'createdAt' | 'id'> & {
            id?: string
            slippage?: number
        },
        triggerConfig: {
            type: 'time' | 'price' | 'both'
            executeAt?: Date
            price?: { value: string; condition: 'above' | 'below' }
        }
    ): Promise<{ success: boolean; taskId?: string; txHash?: string; error?: string }> => {
        if (!relay || !isInitialized) {
            return { success: false, error: 'Gelato client not initialized' }
        }

        if (typeof window === 'undefined' || !(window as any).ethereum) {
            return { success: false, error: 'Wallet not connected' }
        }

        setIsSubmitting(true)

        try {
            const provider = new BrowserProvider((window as any).ethereum)
            const signer = await provider.getSigner()

            // NOTE: The 'recipient' is the Safe Address
            const recipient = order.clientAddresses?.[0]
            if (!recipient) throw new Error('Safe Address (recipient) is required')

            // Get token info
            const tokens = TOKENS_BY_CHAIN[chainId]
            if (!tokens) throw new Error('Chain not supported')

            const tokenInInfo = Object.values(tokens).find(t => t.symbol === order.tokenIn)
            const tokenOutInfo = Object.values(tokens).find(t => t.symbol === order.tokenOut)
            if (!tokenInInfo || !tokenOutInfo) throw new Error(`Tokens not found`)

            const amountInParsed = parseUnits(order.amountIn, tokenInInfo.decimals)

            // Calculate minAmountOut
            let minAmountOutParsed = 0n

            if (triggerConfig.price && triggerConfig.price.value) {
                // TODO: Implement precise minAmountOut calculation based on trigger price
                console.warn('[Gelato] Setting minAmountOut to 0 for execution probability')
            }

            // EIP-712 Signing
            const tradingModuleAddr = TRADING_MODULE_ADDRESSES[chainId]
            if (!tradingModuleAddr) throw new Error('TradingModule address not found for chain')

            const domain = {
                name: "TradingModule",
                version: "1.0.0",
                chainId: BigInt(chainId),
                verifyingContract: tradingModuleAddr
            }

            const types = {
                ExecuteTrade: [
                    { name: 'safe', type: 'address' },
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'minAmountOut', type: 'uint256' },
                    { name: 'feeTier', type: 'uint24' },
                    { name: 'deadline', type: 'uint256' }
                ]
            }

            // 1 Year validity for the signature
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 31536000)

            const value = {
                safe: recipient,
                tokenIn: tokenInInfo.address,
                tokenOut: tokenOutInfo.address,
                amountIn: amountInParsed,
                minAmountOut: minAmountOutParsed,
                feeTier: FEE_TIERS.LOW,
                deadline
            }

            console.log('[Gelato] Requesting EIP-712 Signature...')
            const signature = await signer.signTypedData(domain, types, value)
            console.log('[Gelato] Signature collected:', signature)

            // Generate unique task ID
            const taskId = `gelato_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

            // Create task record
            const task: GelatoTask = {
                taskId,
                orderId: order.id || `order_${Date.now()}`,
                status: 'active',
                createdAt: new Date().toISOString(),
                triggerType: triggerConfig.type,
                triggerCondition: {
                    time: triggerConfig.executeAt?.toISOString(),
                    price: triggerConfig.price
                },
                tradeParams: {
                    safe: value.safe,
                    tokenIn: value.tokenIn,
                    tokenOut: value.tokenOut,
                    amountIn: value.amountIn.toString(),
                    minAmountOut: value.minAmountOut.toString(),
                    feeTier: value.feeTier,
                    deadline: value.deadline.toString()
                },
                tradeSignature: signature
            }

            // Save task
            const tasks = loadTasks()
            tasks.unshift(task)
            saveTasks(tasks)

            console.log('[Gelato] Trigger created:', taskId)
            setIsSubmitting(false)
            return { success: true, taskId }

        } catch (err: any) {
            console.error('[Gelato] Failed to create trigger:', err)
            setIsSubmitting(false)
            return { success: false, error: err.message || 'Failed to create trigger' }
        }
    }, [relay, isInitialized, chainId, loadTasks, saveTasks])

    /**
     * Execute a pending task via Gelato Relay
     */
    const executeTask = useCallback(async (
        taskId: string
    ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
        if (!relay || !isInitialized) {
            return { success: false, error: 'Gelato client not initialized' }
        }

        const tasks = loadTasks()
        const task = tasks.find(t => t.taskId === taskId)

        if (!task || !task.tradeParams || !task.tradeSignature) {
            return { success: false, error: 'Task invalid or missing signature' }
        }

        try {
            updateTask(taskId, { status: 'executing' })

            // Construct call to TradingModule.executeTradeWithSignature
            const tradingModuleInterface = new Interface(TRADING_MODULE_ABI)

            const params = {
                safe: task.tradeParams.safe,
                tokenIn: task.tradeParams.tokenIn,
                tokenOut: task.tradeParams.tokenOut,
                amountIn: BigInt(task.tradeParams.amountIn),
                minAmountOut: BigInt(task.tradeParams.minAmountOut),
                feeTier: task.tradeParams.feeTier,
                deadline: BigInt(task.tradeParams.deadline)
            }

            const data = tradingModuleInterface.encodeFunctionData('executeTradeWithSignature', [
                params,
                task.tradeSignature
            ])

            const tradingModuleAddr = TRADING_MODULE_ADDRESSES[chainId]
            if (!tradingModuleAddr) throw new Error('TradingModule address not found')

            const feeToken = TOKENS_BY_CHAIN[chainId]?.USDC?.address
            if (!feeToken) throw new Error('USDC not found for chain, required for fees')

            // Create SyncFee Request (Manager Pays in USDC)
            const request: CallWithSyncFeeRequest = {
                chainId: BigInt(chainId),
                target: tradingModuleAddr,
                data,
                feeToken,
                isRelayContext: true // Tells Gelato to append fee data
            }

            console.log('[Gelato] Sending callWithSyncFee to TradingModule:', tradingModuleAddr)

            // Send via Gelato Relay
            try {
                const response = await relay.callWithSyncFee(request)
                console.log('[Gelato] Relay task submitted:', response.taskId)

                // Poll for status
                let status = await relay.getTaskStatus(response.taskId)
                let attempts = 0
                const maxAttempts = 60 // 5 minutes max wait

                while (status && !['ExecSuccess', 'ExecReverted', 'Cancelled'].includes(status.taskState) && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 5000))
                    status = await relay.getTaskStatus(response.taskId)
                    attempts++
                }

                if (status?.taskState === 'ExecSuccess') {
                    updateTask(taskId, {
                        status: 'completed',
                        executionData: {
                            txHash: status.transactionHash || undefined,
                            relayTaskId: response.taskId
                        }
                    })
                    console.log('[Gelato] Task executed successfully:', status.transactionHash)
                    return { success: true, txHash: status.transactionHash || undefined }
                } else {
                    const error = status?.lastCheckMessage || 'Execution failed'
                    updateTask(taskId, {
                        status: 'failed',
                        executionData: { error, relayTaskId: response.taskId }
                    })
                    return { success: false, error }
                }

            } catch (err: any) {
                // Handling transfer failures (Allowance issues)
                if (err.message && err.message.includes('ERC20')) {
                    const msg = `Gelato Error: Execution Failed. Please ensure you (Manager) have approved USDC for the TradingModule.`
                    console.error(msg)
                    updateTask(taskId, { status: 'failed', executionData: { error: msg } })
                    return { success: false, error: msg }
                }
                throw err
            }

        } catch (err: any) {
            console.error('[Gelato] Task execution failed:', err)
            updateTask(taskId, {
                status: 'failed',
                executionData: { error: err.message }
            })
            return { success: false, error: err.message }
        }
    }, [relay, isInitialized, chainId, loadTasks, updateTask])

    /**
     * Monitor active tasks and execute when triggers fire
     */
    const monitorAndExecuteTasks = useCallback(async () => {
        const tasks = loadTasks()
        const activeTasks = tasks.filter(t => t.status === 'active')

        for (const task of activeTasks) {
            let shouldExecute = false
            // Check time trigger
            if (task.triggerCondition?.time) {
                const triggerTime = new Date(task.triggerCondition.time)
                if (new Date() >= triggerTime) {
                    console.log('[Gelato] Time trigger fired for task:', task.taskId)
                    shouldExecute = true
                }
            }

            // Check price trigger
            const priceTrigger = task.triggerCondition?.price
            if (priceTrigger && !shouldExecute) {
                try {
                    const provider = new BrowserProvider((window as any).ethereum)
                    const quoterAddress = QUOTER_ADDRESSES[chainId] || QUOTER_ADDRESSES[42161]
                    const quoter = new Contract(quoterAddress, QUOTER_ABI, provider)

                    const tIn = task.tradeParams?.tokenIn
                    const tOut = task.tradeParams?.tokenOut
                    const feeTier = task.tradeParams?.feeTier || FEE_TIERS.LOW

                    if (tIn && tOut) {
                        const tokens = TOKENS_BY_CHAIN[chainId]
                        const tInInfo = Object.values(tokens || {}).find(t => t.address.toLowerCase() === tIn.toLowerCase())
                        const tOutInfo = Object.values(tokens || {}).find(t => t.address.toLowerCase() === tOut.toLowerCase())

                        if (tInInfo && tOutInfo) {
                            const oneUnit = parseUnits('1', tInInfo.decimals)
                            const quoteWei = await quoter.quoteExactInputSingle.staticCall(
                                tIn, tOut, feeTier, oneUnit, 0
                            )
                            const currentPrice = parseFloat(formatUnits(quoteWei, tOutInfo.decimals))
                            const triggerPrice = parseFloat(priceTrigger.value)

                            // Check condition
                            if (priceTrigger.condition === 'above' && currentPrice >= triggerPrice) {
                                console.log(`[Gelato] Price trigger fired (Above): ${currentPrice} >= ${triggerPrice}`)
                                shouldExecute = true
                            } else if (priceTrigger.condition === 'below' && currentPrice <= triggerPrice) {
                                console.log(`[Gelato] Price trigger fired (Below): ${currentPrice} <= ${triggerPrice}`)
                                shouldExecute = true
                            }
                        }
                    }
                } catch (err) {
                    console.error('[Gelato] Price check failed:', err)
                }
            }

            if (shouldExecute) {
                await executeTask(task.taskId)
            }
        }
    }, [loadTasks, executeTask, chainId])

    // Start monitoring when initialized
    useEffect(() => {
        if (!isInitialized) return
        monitorAndExecuteTasks()
        monitorIntervalRef.current = setInterval(monitorAndExecuteTasks, 30000)
        return () => clearInterval(monitorIntervalRef.current!)
    }, [isInitialized, monitorAndExecuteTasks])

    const cancelTask = useCallback((taskId: string) => {
        updateTask(taskId, { status: 'cancelled' })
        console.log('[Gelato] Task cancelled:', taskId)
    }, [updateTask])

    const getActiveTasks = useCallback(() => gelatoTasks.filter(t => t.status === 'active'), [gelatoTasks])

    return {
        isInitialized,
        isSubmitting,
        gelatoTasks,
        isGelatoConfigured: true,
        createAutonomousTrigger,
        executeTask,
        cancelTask,
        getActiveTasks,
        loadTasks,
        buildSwapCalldata: async () => null
    }
}
