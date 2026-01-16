
// TradingModule contract addresses per chain
export const TRADING_MODULE_ADDRESSES: { [chainId: number]: string } = {
    // 11155111: '0x3E623F647F5Bac0816e88B8FEE93Db92240C772e', // Sepolia (Deprecated)
    42161: '0x05bf469e533214E20fE0efDDDAE6EE3f9a2c5098', // Arbitrum
}

// Default to Sepolia for backwards compatibility
export const TRADING_MODULE_ADDRESS = TRADING_MODULE_ADDRESSES[42161]

// TradingModule ABI
export const TRADING_MODULE_ABI = [
    // Events
    'event TradeExecuted(address indexed safe, address indexed manager, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 valueUSD)',
    'event DailyLimitSet(address indexed safe, address indexed manager, uint256 oldLimit, uint256 newLimit)',
    'event BatchTradeExecuted(address indexed manager, uint256 safesCount, address tokenIn, address tokenOut, uint256 totalAmountIn, uint256 totalFees)',
    'event FeeCollected(address indexed safe, address indexed token, uint256 feeAmount, address indexed treasury)',

    // View functions
    'function getManagerInfo(address safe, address manager) view returns (bool isActive, uint256 limit, uint256 spent, uint256 remaining)',
    'function canExecuteTrade(address safe, address manager, uint256 valueUSD) view returns (bool canTrade)',
    'function getCurrentDay() view returns (uint256)',

    'function treasury() view returns (address)',
    'function platformFeeBps() view returns (uint256)',

    // Single trade
    'function executeTrade((address safe, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint24 feeTier, uint256 deadline) params) returns (uint256 amountOut)',

    // Batch trade - execute same trade across multiple Safes
    'function executeBatchTrade(address[] safes, address tokenIn, address tokenOut, uint256[] amounts, uint256 minAmountOut, uint24 feeTier, uint256 deadline) returns (uint256[] amountsOut)',

    'function setDailyLimit(address safe, uint256 limitUSD)',

    // Constants
    'function PERMISSION_TRADE() view returns (uint8)',
    'function MIN_TRADE_USD() view returns (uint256)',
    'function MAX_DAILY_LIMIT() view returns (uint256)',
] as const

// SwapRouter addresses
export const SWAP_ROUTER_ADDRESSES: { [chainId: number]: string } = {
    11155111: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Sepolia Uniswap V3 Router
    42161: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Arbitrum Uniswap V3 SwapRouter02
}

// Uniswap V3 Quoter addresses
export const QUOTER_ADDRESSES: { [chainId: number]: string } = {
    11155111: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3', // Sepolia QuoterV2
    42161: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6', // Arbitrum QuoterV1
}

// Uniswap Quoter ABI
export const QUOTER_ABI = [
    'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
] as const

// Token addresses
export const TOKENS_BY_CHAIN: { [chainId: number]: { [symbol: string]: { address: string; symbol: string; decimals: number } } } = {
    11155111: { // Sepolia
        WETH: { address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', symbol: 'WETH', decimals: 18 },
        USDC: { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', symbol: 'USDC', decimals: 6 },
        USDT: { address: '0na', symbol: 'USDT', decimals: 6 }, // Add real Sepolia USDT if needed
    },
    42161: { // Arbitrum
        WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', decimals: 18 },
        USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6 },
        USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
    }
}

// Default TOKENS (Sepolia) for backward compatibility
export const TOKENS = TOKENS_BY_CHAIN[42161]

// Fee tiers for Uniswap V3
export const FEE_TIERS = {
    LOW: 500,      // 0.05%
    MEDIUM: 3000,  // 0.3%
    HIGH: 10000,   // 1%
}
