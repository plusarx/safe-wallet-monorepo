import { useState, useCallback } from 'react'
import Safe from '@safe-global/protocol-kit'

import { BrowserProvider } from 'ethers'
import { DELEGATION_MODULE_ADDRESSES } from '../contracts/DelegationModule'
import { TRADING_MODULE_ADDRESSES } from '../contracts/TradingModule'
import type { MetaTransactionData } from '@safe-global/safe-core-sdk-types'



export interface SafeSDKState {
    isConnected: boolean
    safeAddress: string
    signerAddress: string
    isDelegationModuleEnabled: boolean
    isTradingModuleEnabled: boolean
    owners: string[]
    threshold: number
}

export function useSafeSDK() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [safeSdk, setSafeSdk] = useState<Safe | null>(null)
    const [state, setState] = useState<SafeSDKState>({
        isConnected: false,
        safeAddress: '',
        signerAddress: '',
        isDelegationModuleEnabled: false,
        isTradingModuleEnabled: false,
        owners: [],
        threshold: 0,
    })

    /**
     * Connect to a Safe wallet
     */
    const connectSafe = useCallback(async (safeAddress: string): Promise<boolean> => {
        setIsLoading(true)
        setError(null)

        try {
            if (typeof window === 'undefined' || !window.ethereum) {
                throw new Error('Please install MetaMask')
            }

            const provider = new BrowserProvider(window.ethereum as any)
            const signer = await provider.getSigner()
            const signerAddress = await signer.getAddress()

            const safe = await Safe.init({
                provider: window.ethereum as any,
                signer: signerAddress,
                safeAddress,
            })

            const network = await provider.getNetwork()
            const chainId = Number(network.chainId)
            const delegationAddress = DELEGATION_MODULE_ADDRESSES[chainId] || DELEGATION_MODULE_ADDRESSES[11155111]
            const tradingAddress = TRADING_MODULE_ADDRESSES[chainId] || TRADING_MODULE_ADDRESSES[11155111]

            const owners = await safe.getOwners()
            const threshold = await safe.getThreshold()
            const modules = await safe.getModules()

            const isDelegationModuleEnabled = modules.some(
                (m: string) => m.toLowerCase() === delegationAddress.toLowerCase()
            )
            const isTradingModuleEnabled = modules.some(
                (m: string) => m.toLowerCase() === tradingAddress.toLowerCase()
            )

            setSafeSdk(safe)
            setState({
                isConnected: true,
                safeAddress,
                signerAddress,
                isDelegationModuleEnabled,
                isTradingModuleEnabled,
                owners,
                threshold,
            })

            return true
        } catch (err: any) {
            const message = err.message || 'Failed to connect to Safe'
            setError(message)
            console.error('Safe connection error:', err)
            return false
        } finally {
            setIsLoading(false)
        }
    }, [])

    /**
     * Enable both DelegationModule and TradingModule in a single batch transaction
     */
    const enableModules = useCallback(async (): Promise<string | null> => {
        if (!safeSdk) {
            setError('Safe not connected')
            return null
        }

        setIsLoading(true)
        setError(null)

        try {
            const provider = new BrowserProvider(window.ethereum as any)
            const network = await provider.getNetwork()
            const chainId = Number(network.chainId)
            const delegationAddress = DELEGATION_MODULE_ADDRESSES[chainId] || DELEGATION_MODULE_ADDRESSES[11155111]
            const tradingAddress = TRADING_MODULE_ADDRESSES[chainId] || TRADING_MODULE_ADDRESSES[11155111]

            const modules = await safeSdk.getModules()
            const delegationEnabled = modules.some(
                (m: string) => m.toLowerCase() === delegationAddress.toLowerCase()
            )
            const tradingEnabled = modules.some(
                (m: string) => m.toLowerCase() === tradingAddress.toLowerCase()
            )

            // If both already enabled, return early
            if (delegationEnabled && tradingEnabled) {
                setState(prev => ({
                    ...prev,
                    isDelegationModuleEnabled: true,
                    isTradingModuleEnabled: true
                }))
                return 'already_enabled'
            }

            // Build transactions for modules that need enabling
            const transactions: MetaTransactionData[] = []

            if (!delegationEnabled) {
                const enableDelegationTx = await safeSdk.createEnableModuleTx(delegationAddress)
                transactions.push({
                    to: enableDelegationTx.data.to,
                    value: enableDelegationTx.data.value,
                    data: enableDelegationTx.data.data,
                })
            }

            if (!tradingEnabled) {
                const enableTradingTx = await safeSdk.createEnableModuleTx(tradingAddress)
                transactions.push({
                    to: enableTradingTx.data.to,
                    value: enableTradingTx.data.value,
                    data: enableTradingTx.data.data,
                })
            }

            if (transactions.length === 0) {
                return 'already_enabled'
            }

            // Create batch transaction
            const safeTransaction = await safeSdk.createTransaction({ transactions })
            const signedTx = await safeSdk.signTransaction(safeTransaction)
            const txResult = await safeSdk.executeTransaction(signedTx)
            const receipt = await (txResult.transactionResponse as any)?.wait()

            setState(prev => ({
                ...prev,
                isDelegationModuleEnabled: true,
                isTradingModuleEnabled: true
            }))

            return receipt?.hash || 'success'
        } catch (err: any) {
            const message = err.message || 'Failed to enable modules'
            setError(message)
            console.error('Enable modules error:', err)
            return null
        } finally {
            setIsLoading(false)
        }
    }, [safeSdk])

    /**
     * Disable both DelegationModule and TradingModule in a single batch transaction
     */
    const disableModules = useCallback(async (): Promise<string | null> => {
        if (!safeSdk) {
            setError('Safe not connected')
            return null
        }

        setIsLoading(true)
        setError(null)

        try {
            const provider = new BrowserProvider(window.ethereum as any)
            const network = await provider.getNetwork()
            const chainId = Number(network.chainId)
            const delegationAddress = DELEGATION_MODULE_ADDRESSES[chainId] || DELEGATION_MODULE_ADDRESSES[11155111]
            const tradingAddress = TRADING_MODULE_ADDRESSES[chainId] || TRADING_MODULE_ADDRESSES[11155111]

            const modules = await safeSdk.getModules()
            const delegationEnabled = modules.some(
                (m: string) => m.toLowerCase() === delegationAddress.toLowerCase()
            )
            const tradingEnabled = modules.some(
                (m: string) => m.toLowerCase() === tradingAddress.toLowerCase()
            )

            if (!delegationEnabled && !tradingEnabled) {
                return 'already_disabled'
            }

            const transactions: MetaTransactionData[] = []

            if (delegationEnabled) {
                const disableDelegationTx = await safeSdk.createDisableModuleTx(delegationAddress)
                transactions.push({
                    to: disableDelegationTx.data.to,
                    value: disableDelegationTx.data.value,
                    data: disableDelegationTx.data.data,
                })
            }

            if (tradingEnabled) {
                const disableTradingTx = await safeSdk.createDisableModuleTx(tradingAddress)
                transactions.push({
                    to: disableTradingTx.data.to,
                    value: disableTradingTx.data.value,
                    data: disableTradingTx.data.data,
                })
            }

            const safeTransaction = await safeSdk.createTransaction({ transactions })
            const signedTx = await safeSdk.signTransaction(safeTransaction)
            const txResult = await safeSdk.executeTransaction(signedTx)
            const receipt = await (txResult.transactionResponse as any)?.wait()

            setState(prev => ({
                ...prev,
                isDelegationModuleEnabled: false,
                isTradingModuleEnabled: false
            }))

            return receipt?.hash || 'success'
        } catch (err: any) {
            const message = err.message || 'Failed to disable modules'
            setError(message)
            console.error('Disable modules error:', err)
            return null
        } finally {
            setIsLoading(false)
        }
    }, [safeSdk])

    /**
     * Execute arbitrary contract call from Safe
     */
    const executeContractCall = useCallback(async (
        to: string,
        value: string,
        data: string
    ): Promise<string | null> => {
        if (!safeSdk) {
            setError('Safe not connected')
            return null
        }

        setIsLoading(true)
        setError(null)

        try {
            const safeTransactionData: MetaTransactionData = {
                to,
                value,
                data,
            }

            const safeTransaction = await safeSdk.createTransaction({
                transactions: [safeTransactionData]
            })

            const signedTx = await safeSdk.signTransaction(safeTransaction)
            const txResult = await safeSdk.executeTransaction(signedTx)
            const receipt = await (txResult.transactionResponse as any)?.wait()

            return receipt?.hash || 'success'
        } catch (err: any) {
            const message = err.message || 'Failed to execute transaction'
            setError(message)
            console.error('Execute transaction error:', err)
            throw err
        } finally {
            setIsLoading(false)
        }
    }, [safeSdk])

    /**
     * Execute batch of contract calls from Safe
     */
    const executeBatch = useCallback(async (
        transactions: MetaTransactionData[]
    ): Promise<string | null> => {
        if (!safeSdk) {
            setError('Safe not connected')
            return null
        }

        setIsLoading(true)
        setError(null)

        try {
            const safeTransaction = await safeSdk.createTransaction({
                transactions
            })

            const signedTx = await safeSdk.signTransaction(safeTransaction)
            const txResult = await safeSdk.executeTransaction(signedTx)
            const receipt = await (txResult.transactionResponse as any)?.wait()

            return receipt?.hash || 'success'
        } catch (err: any) {
            const message = err.message || 'Failed to execute batch'
            setError(message)
            console.error('Execute batch error:', err)
            throw err
        } finally {
            setIsLoading(false)
        }
    }, [safeSdk])

    const disconnect = useCallback(() => {
        setSafeSdk(null)
        setState({
            isConnected: false,
            safeAddress: '',
            signerAddress: '',
            isDelegationModuleEnabled: false,
            isTradingModuleEnabled: false,
            owners: [],
            threshold: 0,
        })
    }, [])

    // Backward compatibility
    const isModuleEnabled = state.isDelegationModuleEnabled && state.isTradingModuleEnabled

    return {
        isLoading,
        error,
        state: { ...state, isModuleEnabled },
        connectSafe,
        enableModules,
        disableModules,
        enableDelegationModule: enableModules, // Backward compat
        executeContractCall,
        executeBatch,
        disconnect,
    }
}
