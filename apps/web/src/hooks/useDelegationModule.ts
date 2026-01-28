import { useState, useCallback } from 'react'
import useWallet from '@/hooks/wallets/useWallet'

import { Contract, BrowserProvider } from 'ethers'
import { DELEGATION_MODULE_ADDRESS, DELEGATION_MODULE_ADDRESSES, DELEGATION_MODULE_ABI, PERMISSION } from '../contracts/DelegationModule'



export interface Manager {
    managerAddress: string
    name: string
    feeRate: bigint
    isActive: boolean
    registeredAt: bigint
}

export interface Delegation {
    client: string
    manager: string
    permissions: number
    delegatedAt: bigint
    isActive: boolean
}

export function useDelegationModule() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const wallet = useWallet()

    const getContract = useCallback(async (needsSigner = false) => {
        if (!wallet?.provider) {
            console.warn('Wallet provider not available')
            return null
        }

        const provider = new BrowserProvider(wallet.provider)
        const network = await provider.getNetwork()
        const chainId = Number(network.chainId)
        const address = DELEGATION_MODULE_ADDRESSES[chainId] || DELEGATION_MODULE_ADDRESSES[11155111]

        if (!address) {
            console.warn(`DelegationModule not deployed on chain ${chainId}`)
            return null
        }

        if (needsSigner) {
            const signer = await provider.getSigner()
            return new Contract(address, DELEGATION_MODULE_ABI, signer)
        }

        return new Contract(address, DELEGATION_MODULE_ABI, provider)
    }, [wallet?.provider])

    // Get manager info (returns null if not registered)
    const getManager = useCallback(async (address: string): Promise<Manager | null> => {
        try {
            const contract = await getContract()
            if (!contract) return null

            // First check if manager is registered by checking isManagerActive
            // This is safer than calling getManager which reverts for unregistered
            const isActive = await contract.isManagerActive(address).catch(() => false)

            if (!isActive) {
                // Try to get manager info anyway - might be deactivated but registered
                try {
                    const result = await contract.getManager(address)
                    if (result[0] === '0x0000000000000000000000000000000000000000') {
                        return null // Not registered
                    }
                    return {
                        managerAddress: result[0],
                        name: result[1],
                        feeRate: result[2],
                        isActive: result[3],
                        registeredAt: result[4],
                    }
                } catch {
                    return null // Not registered
                }
            }

            const result = await contract.getManager(address)
            return {
                managerAddress: result[0],
                name: result[1],
                feeRate: result[2],
                isActive: result[3],
                registeredAt: result[4],
            }
        } catch (err) {
            console.error('Error getting manager:', err)
            return null
        }
    }, [getContract])

    // Check if manager is active
    const isManagerActive = useCallback(async (address: string): Promise<boolean> => {
        try {
            const contract = await getContract()
            if (!contract) return false
            return await contract.isManagerActive(address)
        } catch (err) {
            console.error('Error checking manager status:', err)
            return false
        }
    }, [getContract])

    // Register as a manager
    const registerManager = useCallback(async (
        name: string,
        feeRate: number // basis points (10 = 0.1%, 100 = 1%)
    ): Promise<string> => {
        setIsLoading(true)
        setError(null)

        try {
            const contract = await getContract(true)
            if (!contract) throw new Error('No wallet connected')
            const tx = await contract.registerManager(name, feeRate)
            const receipt = await tx.wait()
            return receipt.hash
        } catch (err: unknown) {
            const message = (err as { reason?: string; message?: string }).reason ||
                (err as { message?: string }).message ||
                'Failed to register manager'
            setError(message)
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }, [getContract])

    // Update manager info (name and fee rate)
    const updateManagerInfo = useCallback(async (
        name: string,
        feeRate: number // basis points (10 = 0.1%, 100 = 1%)
    ): Promise<string> => {
        setIsLoading(true)
        setError(null)

        try {
            const contract = await getContract(true)
            if (!contract) throw new Error('No wallet connected')
            const tx = await contract.updateManagerInfo(name, feeRate)
            const receipt = await tx.wait()
            return receipt.hash
        } catch (err: unknown) {
            const message = (err as { reason?: string; message?: string }).reason ||
                (err as { message?: string }).message ||
                'Failed to update manager info'
            setError(message)
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }, [getContract])

    // Delegate to manager
    const delegateToManager = useCallback(async (
        managerAddress: string,
        permissions: number = PERMISSION.ALL
    ): Promise<string> => {
        setIsLoading(true)
        setError(null)

        try {
            const contract = await getContract(true)
            if (!contract) throw new Error('No wallet connected')
            const tx = await contract.delegateToManager(managerAddress, permissions)
            const receipt = await tx.wait()
            return receipt.hash
        } catch (err: unknown) {
            const message = (err as { reason?: string; message?: string }).reason ||
                (err as { message?: string }).message ||
                'Failed to delegate'
            setError(message)
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }, [getContract])

    // Update permissions
    const updatePermissions = useCallback(async (
        managerAddress: string,
        newPermissions: number
    ): Promise<string> => {
        setIsLoading(true)
        setError(null)

        try {
            const contract = await getContract(true)
            if (!contract) throw new Error('No wallet connected')
            const tx = await contract.updatePermissions(managerAddress, newPermissions)
            const receipt = await tx.wait()
            return receipt.hash
        } catch (err: unknown) {
            const message = (err as { reason?: string; message?: string }).reason ||
                (err as { message?: string }).message ||
                'Failed to update permissions'
            setError(message)
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }, [getContract])

    // Revoke delegation
    const revokeDelegation = useCallback(async (managerAddress: string): Promise<string> => {
        setIsLoading(true)
        setError(null)

        try {
            const contract = await getContract(true)
            if (!contract) throw new Error('No wallet connected')
            const tx = await contract.revokeDelegation(managerAddress)
            const receipt = await tx.wait()
            return receipt.hash
        } catch (err: unknown) {
            const message = (err as { reason?: string; message?: string }).reason ||
                (err as { message?: string }).message ||
                'Failed to revoke delegation'
            setError(message)
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }, [getContract])

    // Remove client (Manager only)
    const removeClient = useCallback(async (clientAddress: string): Promise<string> => {
        setIsLoading(true)
        setError(null)

        try {
            const contract = await getContract(true)
            if (!contract) throw new Error('No wallet connected')
            const tx = await contract.removeClient(clientAddress)
            const receipt = await tx.wait()
            return receipt.hash
        } catch (err: unknown) {
            const message = (err as { reason?: string; message?: string }).reason ||
                (err as { message?: string }).message ||
                'Failed to remove client'
            setError(message)
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }, [getContract])

    // Get delegation
    const getDelegation = useCallback(async (
        clientAddress: string,
        managerAddress: string
    ): Promise<Delegation | null> => {
        try {
            const contract = await getContract()
            if (!contract) return null
            const result = await contract.getDelegation(clientAddress, managerAddress)
            return {
                client: result[0],
                manager: result[1],
                permissions: Number(result[2]),
                delegatedAt: result[3],
                isActive: result[4],
            }
        } catch (err) {
            console.error('Error getting delegation:', err)
            return null
        }
    }, [getContract])

    // Get client's managers
    const getClientManagers = useCallback(async (clientAddress: string): Promise<string[]> => {
        try {
            const contract = await getContract()
            if (!contract) return []
            return await contract.getClientManagers(clientAddress)
        } catch (err) {
            console.error('Error getting client managers:', err)
            return []
        }
    }, [getContract])

    // Get manager's clients
    const getManagerClients = useCallback(async (managerAddress: string): Promise<string[]> => {
        try {
            const contract = await getContract()
            if (!contract) return []
            return await contract.getManagerClients(managerAddress)
        } catch (err) {
            console.error('Error getting manager clients:', err)
            return []
        }
    }, [getContract])

    // Check authorization
    const isAuthorized = useCallback(async (
        clientAddress: string,
        managerAddress: string,
        permission: number
    ): Promise<boolean> => {
        try {
            const contract = await getContract()
            if (!contract) return false
            return await contract.isAuthorized(clientAddress, managerAddress, permission)
        } catch (err) {
            console.error('Error checking authorization:', err)
            return false
        }
    }, [getContract])

    return {
        isLoading,
        error,
        getManager,
        isManagerActive,
        registerManager,
        updateManagerInfo,
        delegateToManager,
        updatePermissions,
        revokeDelegation,
        removeClient,
        getDelegation,
        getClientManagers,
        getManagerClients,
        isAuthorized,
        PERMISSION,
    }
}

export { DELEGATION_MODULE_ADDRESS, DELEGATION_MODULE_ADDRESSES, PERMISSION }
