/**
 * PulsarX Configuration
 * DeFi protocols and settings for the enhanced Safe wallet
 */

export type ProtocolCategory = 'dex' | 'perps' | 'yield' | 'prediction'

export type Protocol = {
  id: string
  name: string
  category: ProtocolCategory
  description: string
  icon: string
  chains: string[] // chainIds where this protocol is available
  moduleAddress?: string // Optional: address of the trading module
  comingSoon?: boolean
}

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive'

export type QuantStrategy = {
  id: string
  name: string
  description: string
  riskLevel: RiskProfile
}

// DeFi Protocols available for selection
export const DEFI_PROTOCOLS: Protocol[] = [
  // DEXs
  {
    id: 'uniswap-v3',
    name: 'Uniswap V3',
    category: 'dex',
    description: 'Decentralized exchange with concentrated liquidity',
    icon: '/images/pulsarx/protocols/uniswap.svg',
    chains: ['1', '10', '137', '42161', '8453'], // Ethereum, Optimism, Polygon, Arbitrum, Base
  },
  {
    id: 'cowswap',
    name: 'CowSwap',
    category: 'dex',
    description: 'MEV-protected, gasless trading via solver competition',
    icon: '/images/pulsarx/protocols/cowswap.svg',
    chains: ['1', '100', '42161'], // Ethereum, Gnosis, Arbitrum
  },
  {
    id: 'curve',
    name: 'Curve',
    category: 'dex',
    description: 'Optimized for stablecoin and pegged asset swaps',
    icon: '/images/pulsarx/protocols/curve.svg',
    chains: ['1', '10', '137', '42161'],
    comingSoon: true,
  },
  {
    id: 'balancer',
    name: 'Balancer',
    category: 'dex',
    description: 'Automated portfolio manager and DEX',
    icon: '/images/pulsarx/protocols/balancer.svg',
    chains: ['1', '10', '137', '42161'],
    comingSoon: true,
  },

  // Perpetuals
  {
    id: 'gmx',
    name: 'GMX',
    category: 'perps',
    description: 'Decentralized perpetual exchange with low fees',
    icon: '/images/pulsarx/protocols/gmx.svg',
    chains: ['42161', '43114'], // Arbitrum, Avalanche
  },
  {
    id: 'hyperliquid',
    name: 'Hyperliquid',
    category: 'perps',
    description: 'High-performance on-chain perpetual DEX',
    icon: '/images/pulsarx/protocols/hyperliquid.svg',
    chains: ['42161'],
    comingSoon: true,
  },
  {
    id: 'vertex',
    name: 'Vertex',
    category: 'perps',
    description: 'Cross-margined DEX with spot, perps, and money markets',
    icon: '/images/pulsarx/protocols/vertex.svg',
    chains: ['42161'],
    comingSoon: true,
  },

  // Yield Protocols
  {
    id: 'pendle',
    name: 'Pendle',
    category: 'yield',
    description: 'Trade and hedge yield with tokenized future yield',
    icon: '/images/pulsarx/protocols/pendle.svg',
    chains: ['1', '42161'],
  },
  {
    id: 'morpho',
    name: 'Morpho',
    category: 'yield',
    description: 'Optimized lending with better rates via P2P matching',
    icon: '/images/pulsarx/protocols/morpho.svg',
    chains: ['1', '8453'],
  },
  {
    id: 'aave-v3',
    name: 'Aave V3',
    category: 'yield',
    description: 'Leading decentralized lending protocol',
    icon: '/images/pulsarx/protocols/aave.svg',
    chains: ['1', '10', '137', '42161', '8453'],
  },
  {
    id: 'yearn',
    name: 'Yearn',
    category: 'yield',
    description: 'Automated yield optimization strategies',
    icon: '/images/pulsarx/protocols/yearn.svg',
    chains: ['1', '10', '137', '42161'],
    comingSoon: true,
  },

  // Prediction Markets
  {
    id: 'polymarket',
    name: 'Polymarket',
    category: 'prediction',
    description: 'Decentralized prediction market for real-world events',
    icon: '/images/pulsarx/protocols/polymarket.svg',
    chains: ['137'],
    comingSoon: true,
  },
]

// Asset Manager Strategies
export const QUANT_STRATEGIES: QuantStrategy[] = [
  {
    id: 'yield-optimization',
    name: 'Yield Optimization',
    description: 'Automatically move funds to highest-yielding protocols',
    riskLevel: 'conservative',
  },
  {
    id: 'auto-rebalancing',
    name: 'Auto-rebalancing',
    description: 'Maintain target portfolio allocation automatically',
    riskLevel: 'moderate',
  },
  {
    id: 'delta-neutral',
    name: 'Delta-neutral Farming',
    description: 'Earn yield while hedging directional risk',
    riskLevel: 'moderate',
  },
  {
    id: 'cross-dex-arbitrage',
    name: 'Cross-DEX Arbitrage',
    description: 'Capture price differences across exchanges',
    riskLevel: 'aggressive',
  },
]

// Risk profile descriptions
export const RISK_PROFILES: Record<RiskProfile, { label: string; description: string }> = {
  conservative: {
    label: 'Conservative',
    description: 'Low risk, stable yields focused on capital preservation',
  },
  moderate: {
    label: 'Moderate',
    description: 'Balanced risk/reward with diversified strategies',
  },
  aggressive: {
    label: 'Aggressive',
    description: 'High risk, maximum returns with active strategies',
  },
}

// Protocol category labels
export const PROTOCOL_CATEGORIES: Record<ProtocolCategory, { label: string }> = {
  dex: { label: 'DEXs' },
  perps: { label: 'Perpetuals' },
  yield: { label: 'Yield Protocols' },
  prediction: { label: 'Prediction Markets' },
}

// Helper function to get protocols by category
export const getProtocolsByCategory = (category: ProtocolCategory): Protocol[] => {
  return DEFI_PROTOCOLS.filter((p) => p.category === category)
}

// Helper function to check if protocol is available on chain
export const isProtocolAvailableOnChain = (protocol: Protocol, chainId: string): boolean => {
  return protocol.chains.includes(chainId)
}

// Default selected protocols for new users
export const DEFAULT_SELECTED_PROTOCOLS = ['uniswap-v3', 'cowswap', 'aave-v3']
