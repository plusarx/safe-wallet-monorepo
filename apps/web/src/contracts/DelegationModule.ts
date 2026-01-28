// DelegationModule Contract - Multi-chain
// Sepolia: 0xD9e6B231EfA5175a322d610ce22d247bF0ee607B

export const DELEGATION_MODULE_ADDRESSES: { [chainId: number]: string } = {
    // 11155111: '0xD9e6B231EfA5175a322d610ce22d247bF0ee607B', // Sepolia (Deprecated)
    // 42161: '0xF15763E65314d8B14E51C889bf6828242aeB1D42', // Old Arbitrum
    42161: '0xA95E322A2Bcf4D978245331f301543d63788537B', // Arbitrum
}

// Default to Sepolia for backwards compatibility
export const DELEGATION_MODULE_ADDRESS = DELEGATION_MODULE_ADDRESSES[42161]

export const DELEGATION_MODULE_ABI = [
    // Permission constants
    'function PERMISSION_TRADE() view returns (uint8)',
    'function PERMISSION_REBALANCE() view returns (uint8)',
    'function PERMISSION_YIELD() view returns (uint8)',
    'function PERMISSION_ALL() view returns (uint8)',

    // Manager functions
    'function registerManager(string name, uint256 feeRate) external',
    'function updateManagerInfo(string name, uint256 feeRate) external',
    'function deactivateManager() external',
    'function reactivateManager() external',
    'function removeClient(address client) external',

    // Client/Safe functions
    'function delegateToManager(address manager, uint8 permissions) external',
    'function updatePermissions(address manager, uint8 newPermissions) external',
    'function revokeDelegation(address manager) external',
    'function revokeAllDelegations() external',

    // View functions
    'function getManager(address manager) view returns (tuple(address managerAddress, string name, uint256 feeRate, bool isActive, uint256 registeredAt))',
    'function isManagerActive(address manager) view returns (bool)',
    'function getDelegation(address client, address manager) view returns (tuple(address client, address manager, uint8 permissions, uint256 delegatedAt, bool isActive))',
    'function getClientManagers(address client) view returns (address[])',
    'function getManagerClients(address manager) view returns (address[])',
    'function isAuthorized(address client, address manager, uint8 requiredPermission) view returns (bool)',
    'function getManagerClientCount(address manager) view returns (uint256)',
    'function getAllManagers() view returns (address[])',

    // Events
    'event ManagerRegistered(address indexed manager, string name, uint256 feeRate)',
    'event ManagerUpdated(address indexed manager, string name, uint256 feeRate)',
    'event ManagerDeactivated(address indexed manager)',
    'event ManagerReactivated(address indexed manager)',
    'event DelegationCreated(address indexed client, address indexed manager, uint8 permissions)',
    'event DelegationUpdated(address indexed client, address indexed manager, uint8 newPermissions)',
    'event DelegationRevoked(address indexed client, address indexed manager)',
] as const

// Permission flags
export const PERMISSION = {
    TRADE: 1,
    REBALANCE: 2,
    YIELD: 4,
    ALL: 7,
} as const
