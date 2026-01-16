import { type Address } from 'viem'

// ============ Delegator Contracts by Wallet ============
// Each wallet uses their own delegator contract for EIP-7702

export const DELEGATOR_CONTRACTS = {
    // MetaMask Delegator - official contract
    metamask: '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B' as Address,

    // Safe's SafeLite - for Safe-compatible flow
    safeLite: '0x7702417c8d8339ba04a5a8Ce07f8C3B7bBD65AB1' as Address,

    // Rabby uses similar approach to MetaMask (fork)
    // They likely use MetaMask delegator or their own
    rabby: '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B' as Address,

    // Trust Wallet - uses their own for FlexGas
    // (Address TBD - they may use same as MetaMask or custom)
    trustWallet: '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B' as Address,
} as const

// Known delegator addresses for detection
export const KNOWN_DELEGATORS = [
    DELEGATOR_CONTRACTS.metamask,
    DELEGATOR_CONTRACTS.safeLite,
]

// ============ ABIs ============

// MetaMask Delegator ABI (subset for batch execution)
export const METAMASK_DELEGATOR_ABI = [
    {
        name: 'execute',
        type: 'function',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' },
        ],
        outputs: [{ name: '', type: 'bytes' }],
    },
    {
        name: 'executeBatch',
        type: 'function',
        inputs: [
            {
                name: 'calls',
                type: 'tuple[]',
                components: [
                    { name: 'target', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'data', type: 'bytes' },
                ],
            },
        ],
        outputs: [{ name: '', type: 'bytes[]' }],
    },
] as const

// SafeLite ABI
export const SAFE_LITE_ABI = [
    {
        name: 'execute',
        type: 'function',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' },
        ],
        outputs: [],
    },
    {
        name: 'executeBatch',
        type: 'function',
        inputs: [
            {
                name: 'calls',
                type: 'tuple[]',
                components: [
                    { name: 'to', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'data', type: 'bytes' },
                ],
            },
        ],
        outputs: [],
    },
] as const

// enableModule ABI
export const ENABLE_MODULE_ABI = [{
    name: 'enableModule',
    type: 'function',
    inputs: [{ name: 'module', type: 'address' }],
    outputs: [],
}] as const
