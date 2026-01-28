/**
 * Gelato Network Configuration
 *
 * This module provides configuration for Gelato's autonomous order execution.
 * Web3 Functions enable time and price-based triggers that execute even when
 * the user's browser is closed.
 */

export const GELATO_CONFIG = {
    // API Key from environment
    apiKey: process.env.NEXT_PUBLIC_GELATO_API_KEY || '',

    // RPC endpoints
    baseUrl: 'https://api.gelato.cloud/rpc',
    testnetBaseUrl: 'https://api.t.gelato.cloud/rpc',

    // Supported chains for automation
    supportedChains: {
        42161: 'arbitrum', // Arbitrum One
        8453: 'base', // Base
        1: 'ethereum', // Ethereum Mainnet
        10: 'optimism', // Optimism
        137: 'polygon', // Polygon
    } as Record<number, string>,

    // Chain IDs where we default to testnet mode
    testnetChainIds: [421614, 84532, 11155111] as number[], // Arb Sepolia, Base Sepolia, Sepolia

    // Trigger configuration
    triggers: {
        // Minimum interval between trigger checks (milliseconds)
        minInterval: 60000, // 1 minute

        // Maximum time a trigger can be pending (24 hours)
        maxPendingDuration: 24 * 60 * 60 * 1000,

        // Price tolerance for price triggers (basis points)
        priceTolerance: 50, // 0.5%
    },

    // Gas settings
    gas: {
        // Buffer for gas estimation
        estimationBuffer: 1.2,

        // Max gas limit for triggered transactions
        maxGasLimit: 500000,
    },
} as const

/**
 * Check if a chain is supported by Gelato
 */
export function isChainSupported(chainId: number): boolean {
    return chainId in GELATO_CONFIG.supportedChains || GELATO_CONFIG.testnetChainIds.includes(chainId)
}

/**
 * Check if running on testnet
 */
export function isTestnet(chainId: number): boolean {
    return GELATO_CONFIG.testnetChainIds.includes(chainId)
}

/**
 * Get the appropriate Gelato RPC URL for the chain
 */
export function getGelatoRpcUrl(chainId: number): string {
    return isTestnet(chainId) ? GELATO_CONFIG.testnetBaseUrl : GELATO_CONFIG.baseUrl
}

/**
 * Validate that Gelato API key is configured
 */
export function isGelatoConfigured(): boolean {
    return Boolean(GELATO_CONFIG.apiKey)
}
