import { useState, useCallback } from 'react'
import {
    createWalletClient,
    custom,
    createPublicClient,
    encodeFunctionData,
    type Address,
    toHex,
    hexToNumber,
} from 'viem'
import { arbitrum } from 'viem/chains'
import { DELEGATION_MODULE_ADDRESSES, DELEGATION_MODULE_ABI } from '../contracts/DelegationModule'
import { TRADING_MODULE_ADDRESSES } from '../contracts/TradingModule'
import {
    DELEGATOR_CONTRACTS,
    METAMASK_DELEGATOR_ABI,
    SAFE_LITE_ABI,
    ENABLE_MODULE_ABI
} from '../contracts/EIP7702'

// ============ Types ============

export type WalletProvider = 'metamask' | 'rabby' | 'trustwallet' | 'safeLite' | 'unknown'
export type DelegatorType = 'metamask' | 'safeLite' | 'unknown'

export interface EIP7702State {
    isConnected: boolean
    chainId: number
    eoaAddress: Address | null
    isDelegated: boolean
    delegationTarget: Address | null
    delegatorType: DelegatorType
    walletProvider: WalletProvider
}

// ============ Helpers ============

const getEthereumProvider = () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
        return (window as any).ethereum
    }
    return null
}

const detectWalletProvider = (): WalletProvider => {
    const ethereum = getEthereumProvider()
    if (!ethereum) return 'unknown'

    // Check for specific wallet providers
    if (ethereum.isRabby) return 'rabby'
    if (ethereum.isTrust || ethereum.isTrustWallet) return 'trustwallet'
    if (ethereum.isMetaMask) return 'metamask'

    return 'unknown'
}

const getDelegatorType = (delegationTarget: Address | null): DelegatorType => {
    if (!delegationTarget) return 'unknown'
    const target = delegationTarget.toLowerCase()

    if (target === DELEGATOR_CONTRACTS.metamask.toLowerCase()) return 'metamask'
    if (target === DELEGATOR_CONTRACTS.safeLite.toLowerCase()) return 'safeLite'

    return 'unknown'
}

// ... hook
export function useEIP7702() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [state, setState] = useState<EIP7702State>({
        isConnected: false,
        chainId: 0,
        eoaAddress: null,
        isDelegated: false,
        delegationTarget: null,
        delegatorType: 'unknown',
        walletProvider: 'unknown',
    })

    const getChain = (chainId: number) => {
        if (chainId === 42161) return arbitrum
        return arbitrum
    }

    const connectEOA = useCallback(async (): Promise<Address | null> => {
        const ethereum = getEthereumProvider()
        if (!ethereum) {
            setError('Please install a Web3 wallet (MetaMask, Rabby, Trust Wallet)')
            return null
        }

        setIsLoading(true)
        setError(null)

        try {
            const walletProvider = detectWalletProvider()

            // Get chain ID
            const chainIdHex = await ethereum.request({ method: 'eth_chainId' })
            const chainId = parseInt(chainIdHex, 16)
            const chain = getChain(chainId)

            const walletClient = createWalletClient({
                chain,
                transport: custom(ethereum),
            })

            const [address] = await walletClient.requestAddresses()

            const publicClient = createPublicClient({
                chain,
                transport: custom(ethereum),
            })

            const code = await publicClient.getCode({ address })
            const isDelegated = code !== undefined && code !== '0x' && code.startsWith('0xef0100')
            let delegationTarget: Address | null = null

            if (isDelegated && code && code.length >= 46) {
                delegationTarget = ('0x' + code.slice(8, 48)) as Address
            }

            const delegatorType = getDelegatorType(delegationTarget)

            setState({
                isConnected: true,
                chainId,
                eoaAddress: address,
                isDelegated,
                delegationTarget,
                delegatorType,
                walletProvider,
            })

            return address
        } catch (err: any) {
            setError(err.message || 'Failed to connect')
            return null
        } finally {
            setIsLoading(false)
        }
    }, [])

    const requestSmartAccountUpgrade = useCallback(async (): Promise<boolean> => {
        const ethereum = getEthereumProvider()
        if (!state.eoaAddress || !ethereum) {
            setError('Connect wallet first')
            return false
        }
        if (state.isDelegated) return true

        setIsLoading(true)
        setError(null)

        try {
            const chain = getChain(state.chainId)

            // MetaMask native switch
            if (state.walletProvider === 'metamask') {
                try {
                    await ethereum.request({
                        method: 'wallet_switchToSmartAccount',
                        params: [{ address: state.eoaAddress, chainId: state.chainId }],
                    })
                    await connectEOA()
                    return true
                } catch (e) { console.log('MetaMask native switch failed, falling back') }
            }

            // Fallback: Manual EIP-7702 Transaction
            const delegatorAddress = state.walletProvider === 'safeLite'
                ? DELEGATOR_CONTRACTS.safeLite
                : DELEGATOR_CONTRACTS.metamask

            const publicClient = createPublicClient({
                chain,
                transport: custom(ethereum),
            })
            const nonce = await publicClient.getTransactionCount({ address: state.eoaAddress })

            // Sign Auth
            let signature: string | null = null
            const chainIdHex = toHex(state.chainId)
            const nonceHex = toHex(nonce)

            const signingMethods = [
                { method: 'wallet_signAuthorization', params: [{ chainId: chainIdHex, address: delegatorAddress, nonce: nonceHex }] },
                { method: 'eth_sign7702Authorization', params: [{ chainId: chainIdHex, address: delegatorAddress, nonce: nonceHex }] },
            ]

            for (const { method, params } of signingMethods) {
                try {
                    signature = await ethereum.request({ method, params })
                    if (signature) break
                } catch (e) { continue }
            }

            if (!signature) throw new Error('Wallet does not support EIP-7702 signing')

            // Parse sig
            const r = ('0x' + signature.slice(2, 66)) as `0x${string}`
            const s = ('0x' + signature.slice(66, 130)) as `0x${string}`
            let v = hexToNumber(('0x' + signature.slice(130, 132)) as `0x${string}`)
            if (v >= 27) v -= 27

            // Send Type-4 TX
            const hash = await ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: state.eoaAddress,
                    to: state.eoaAddress,
                    value: '0x0',
                    type: '0x04',
                    authorizationList: [{
                        chainId: chainIdHex,
                        address: delegatorAddress,
                        nonce: nonceHex,
                        yParity: toHex(v),
                        r, s
                    }]
                }]
            })

            await publicClient.waitForTransactionReceipt({ hash })

            setState(prev => ({
                ...prev,
                isDelegated: true,
                delegationTarget: delegatorAddress,
                delegatorType: getDelegatorType(delegatorAddress)
            }))
            return true

        } catch (err: any) {
            console.error('Upgrade failed:', err)
            setError(err.message)
            return false
        } finally {
            setIsLoading(false)
        }
    }, [state.eoaAddress, state.isDelegated, state.chainId, state.walletProvider, connectEOA])

    const executeBatch = useCallback(async (
        calls: Array<{ to: Address; value: bigint; data: `0x${string}` }>
    ): Promise<string | null> => {
        const ethereum = getEthereumProvider()
        if (!state.eoaAddress || !ethereum) return null

        setIsLoading(true)
        try {
            const chain = getChain(state.chainId)
            const walletClient = createWalletClient({
                chain,
                transport: custom(ethereum),
                account: state.eoaAddress
            })

            let batchData: `0x${string}`
            if (state.delegatorType === 'metamask') {
                batchData = encodeFunctionData({
                    abi: METAMASK_DELEGATOR_ABI,
                    functionName: 'executeBatch',
                    args: [calls.map(c => ({ target: c.to, value: c.value, data: c.data }))]
                })
            } else {
                batchData = encodeFunctionData({
                    abi: SAFE_LITE_ABI,
                    functionName: 'executeBatch',
                    args: [calls]
                })
            }

            return await walletClient.sendTransaction({
                to: state.eoaAddress,
                data: batchData,
                chain
            })
        } catch (err: any) {
            setError(err.message)
            return null
        } finally {
            setIsLoading(false)
        }
    }, [state.eoaAddress, state.chainId, state.delegatorType])

    const enableModulesAndDelegate = useCallback(async (
        managerAddress: Address,
        permissions: number = 0xFF
    ): Promise<string | null> => {
        // Get correct addresses for current chain
        const delegationModule = DELEGATION_MODULE_ADDRESSES[state.chainId]
        const tradingModule = TRADING_MODULE_ADDRESSES[state.chainId]

        if (!delegationModule || !tradingModule) {
            setError(`Contracts not deployed on chain ${state.chainId}`)
            return null
        }

        const delegateData = encodeFunctionData({
            abi: DELEGATION_MODULE_ABI,
            functionName: 'delegateToManager',
            args: [managerAddress, permissions],
        })

        const enableDelegationData = encodeFunctionData({
            abi: ENABLE_MODULE_ABI,
            functionName: 'enableModule',
            args: [delegationModule as Address],
        })

        const enableTradingData = encodeFunctionData({
            abi: ENABLE_MODULE_ABI,
            functionName: 'enableModule',
            args: [tradingModule as Address],
        })

        return executeBatch([
            { to: state.eoaAddress as Address, value: 0n, data: enableDelegationData },
            { to: state.eoaAddress as Address, value: 0n, data: enableTradingData },
            { to: delegationModule as Address, value: 0n, data: delegateData },
        ])
    }, [state.chainId, state.eoaAddress, executeBatch])

    /**
     * Full onboarding flow
     */
    const fullOnboarding = useCallback(async (
        managerAddress: Address,
        permissions: number = 0xFF
    ): Promise<{ success: boolean; txHash?: string }> => {
        setIsLoading(true)
        setError(null)

        try {
            // Step 1: Upgrade to smart account if needed
            if (!state.isDelegated) {
                const upgraded = await requestSmartAccountUpgrade()
                if (!upgraded) {
                    return { success: false }
                }
            }

            // Step 2: Enable modules and delegate
            const txHash = await enableModulesAndDelegate(managerAddress, permissions)
            if (!txHash) {
                return { success: false }
            }

            return { success: true, txHash }
        } catch (err: any) {
            setError(err.message || 'Onboarding failed')
            return { success: false }
        } finally {
            setIsLoading(false)
        }
    }, [state.isDelegated, requestSmartAccountUpgrade, enableModulesAndDelegate])

    /**
     * Get wallet support info
     */
    const getWalletSupportInfo = useCallback(() => {
        const { walletProvider } = state

        const supportInfo = {
            metamask: { name: 'MetaMask', supported: true, note: 'Full native support' },
            rabby: { name: 'Rabby', supported: true, note: 'Limited support (MetaMask fork)' },
            trustwallet: { name: 'Trust Wallet', supported: true, note: 'Native FlexGas support' },
            safeLite: { name: 'Safe Lite', supported: true, note: 'Safe EIP-7702 implementation' },
            unknown: { name: 'Unknown Wallet', supported: false, note: 'May not support EIP-7702' },
        }

        return supportInfo[walletProvider] || supportInfo.unknown
    }, [state])

    return {
        isLoading,
        error,
        state,
        connectEOA,
        requestSmartAccountUpgrade,
        executeBatch,
        enableModulesAndDelegate,
        fullOnboarding,
        getWalletSupportInfo,
        DELEGATOR_CONTRACTS,
    }
}
