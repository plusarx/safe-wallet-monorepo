import { useState, useCallback } from 'react'
import type { Eip1193Provider} from 'ethers';
import { Contract, BrowserProvider, parseUnits, formatUnits } from 'ethers'

import {
    TRADING_MODULE_ADDRESSES,
    TRADING_MODULE_ABI,
    TOKENS,
    FEE_TIERS,
    QUOTER_ADDRESSES,
    QUOTER_ABI
} from '../contracts/TradingModule'

declare global {
    interface Window {
        ethereum?: Eip1193Provider
    }
}

export interface TradeParams {
    safe: string
    tokenIn: string
    tokenOut: string
    amountIn: string
    minAmountOut: string
    feeTier: number
    deadline: number
    tokenInDecimals: number
    tokenOutDecimals: number
}

export interface BatchTradeParams {
    safes: string[]
    tokenIn: string
    tokenOut: string
    amounts: string[]
    minAmountOut: string
    feeTier: number
    deadline: number
    tokenInDecimals: number
    tokenOutDecimals: number
}

export interface ManagerInfo {
    isActive: boolean
    limit: string
    spent: string
    remaining: string
}

export function useTradingModule() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const getContract = useCallback(async (needsSigner = false) => {
        if (typeof window === 'undefined' || !window.ethereum) {
            throw new Error('No wallet detected')
        }

        const provider = new BrowserProvider(window.ethereum)
        const network = await provider.getNetwork()
        const chainId = Number(network.chainId)
        const address = TRADING_MODULE_ADDRESSES[chainId] || TRADING_MODULE_ADDRESSES[11155111]

        if (needsSigner) {
            const signer = await provider.getSigner()
            return new Contract(address, TRADING_MODULE_ABI, signer)
        }

        return new Contract(address, TRADING_MODULE_ABI, provider)
    }, [])

    /**
     * Execute a single trade
     */
    const executeTrade = useCallback(async (params: TradeParams): Promise<string> => {
        setIsLoading(true)
        setError(null)

        try {
            const contract = await getContract(true)

            const tradeParams = {
                safe: params.safe,
                tokenIn: params.tokenIn,
                tokenOut: params.tokenOut,
                tokenOut: params.tokenOut,
                amountIn: parseUnits(params.amountIn, params.tokenInDecimals),
                minAmountOut: parseUnits(params.minAmountOut, params.tokenOutDecimals),
                feeTier: params.feeTier,
                deadline: params.deadline,
            }

            const tx = await contract.executeTrade(tradeParams)
            const receipt = await tx.wait()
            return receipt.hash
        } catch (err: unknown) {
            const message = (err as { reason?: string; message?: string }).reason ||
                (err as { message?: string }).message || 'Failed to execute trade'
            setError(message)
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }, [getContract])

    /**
     * Execute batch trade across multiple Safes
     */
    const executeBatchTrade = useCallback(async (params: BatchTradeParams): Promise<string> => {
        setIsLoading(true)
        setError(null)

        try {
            const contract = await getContract(true)

            // Convert amounts to BigInt
            const amountsWei = params.amounts.map(a => parseUnits(a, params.tokenInDecimals))

            const tx = await contract.executeBatchTrade(
                params.safes,
                params.tokenIn,
                params.tokenOut,
                amountsWei,
                parseUnits(params.minAmountOut, params.tokenOutDecimals),
                params.feeTier,
                params.deadline
            )
            const receipt = await tx.wait()
            return receipt.hash
        } catch (err: unknown) {
            const message = (err as { reason?: string; message?: string }).reason ||
                (err as { message?: string }).message || 'Failed to execute batch trade'
            setError(message)
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }, [getContract])

    /**
     * Set daily trading limit
     */
    const setDailyLimit = useCallback(async (safe: string, limitUSD: string): Promise<string> => {
        setIsLoading(true)
        setError(null)

        try {
            const contract = await getContract(true)
            const tx = await contract.setDailyLimit(safe, parseUnits(limitUSD, 18))
            const receipt = await tx.wait()
            return receipt.hash
        } catch (err: unknown) {
            const message = (err as { reason?: string; message?: string }).reason ||
                (err as { message?: string }).message || 'Failed to set daily limit'
            setError(message)
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }, [getContract])

    /**
     * Get manager's trading info for a specific Safe
     */
    const getManagerInfo = useCallback(async (safe: string, manager: string): Promise<ManagerInfo> => {
        try {
            const contract = await getContract()
            const [isActive, limit, spent, remaining] = await contract.getManagerInfo(safe, manager)

            return {
                isActive,
                limit: formatUnits(limit, 18),
                spent: formatUnits(spent, 18),
                remaining: formatUnits(remaining, 18),
            }
        } catch (err) {
            console.error('Error getting manager info:', err)
            return { isActive: false, limit: '0', spent: '0', remaining: '0' }
        }
    }, [getContract])

    /**
     * Check if manager can execute trade
     */
    const canExecuteTrade = useCallback(async (safe: string, manager: string, valueUSD: string): Promise<boolean> => {
        try {
            const contract = await getContract()
            return await contract.canExecuteTrade(safe, manager, parseUnits(valueUSD, 18))
        } catch (err) {
            console.error('Error checking trade ability:', err)
            return false
        }
    }, [getContract])

    /**
     * Calculate platform fee for amount
     */
    const calculateFee = useCallback(async (amount: string): Promise<string> => {
        try {
            const contract = await getContract()
            const feeBps = await contract.platformFeeBps()
            const amountBn = parseUnits(amount, 18)
            const fee = (amountBn * feeBps) / 10000n
            return formatUnits(fee, 18)
        } catch (err) {
            console.error('Error calculating fee:', err)
            return '0'
        }
    }, [getContract])

    /**
     * Get quote from Uniswap V3 Quoter
     */
    const getQuote = useCallback(async (
        tokenIn: string,
        tokenOut: string,
        amountIn: string,
        feeTier: number,
        tokenInDecimals: number,
        tokenOutDecimals: number
    ): Promise<string> => {
        if (!amountIn || amountIn === '0') return '0'

        try {
            const provider = new BrowserProvider(window.ethereum as any)
            const network = await provider.getNetwork()
            const chainId = Number(network.chainId)
            const quoterAddress = QUOTER_ADDRESSES[chainId] || QUOTER_ADDRESSES[42161]

            const quoter = new Contract(quoterAddress, QUOTER_ABI, provider)

            const amountInWei = parseUnits(amountIn, tokenInDecimals)
            const sqrtPriceLimitX96 = 0

            const amountOutWei = await quoter.quoteExactInputSingle.staticCall(
                tokenIn,
                tokenOut,
                feeTier,
                amountInWei,
                sqrtPriceLimitX96
            )

            return formatUnits(amountOutWei, tokenOutDecimals)
        } catch (err) {
            console.error('Error getting quote:', err)
            return '0'
        }
    }, [])

    return {
        isLoading,
        error,
        executeTrade,
        executeBatchTrade,
        setDailyLimit,
        getManagerInfo,
        canExecuteTrade,
        calculateFee,
        getQuote,
        TOKENS,
        FEE_TIERS,
    }
}
