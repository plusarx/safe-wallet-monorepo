'use client'

import { useState, useEffect, useCallback } from 'react'
import { BrowserProvider, Contract, formatUnits } from 'ethers'
import {
    Box,
    Typography,
    Paper,
    Grid,
    Chip,
    Divider,
    CircularProgress,
    Alert,
    Button,
    Skeleton,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import GroupIcon from '@mui/icons-material/Group'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import { useDelegationModule } from '../../../hooks/useDelegationModule'
import { TRADING_MODULE_ADDRESSES, TOKENS_BY_CHAIN } from '../../../contracts/TradingModule'

interface ClientInfo {
    address: string
    walletType: 'safe' | 'eoa'
    usdcBalance: string
    wethBalance: string
    totalValue: number // USD value
}

interface SummaryData {
    totalClients: number
    safeClients: number
    eoaClients: number
    totalTrades: number
    totalVolumeUSD: number
    unrealizedPnL: number
    realizedPnL: number
}

// Treasury address for fee detection (used to count trades)
const TREASURY_ADDRESS = '0x9FFc3Ad75A809EAAF2115140d81F34Fcf190feCb'

// Platform fee: 10 bps = 0.1%
const PLATFORM_FEE_BPS = 10

// Minimal ERC20 ABI
const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
]

import useWallet from '@/hooks/wallets/useWallet'

export default function Summary() {
    const wallet = useWallet()
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [clients, setClients] = useState<ClientInfo[]>([])
    const [summary, setSummary] = useState<SummaryData>({
        totalClients: 0,
        safeClients: 0,
        eoaClients: 0,
        totalTrades: 0,
        totalVolumeUSD: 0,
        unrealizedPnL: 0,
        realizedPnL: 0,
    })

    const { getManagerClients, getDelegation } = useDelegationModule()

    const loadData = useCallback(async () => {
        if (!wallet?.address || !wallet?.provider) return

        setIsLoading(true)
        setError(null)

        try {
            const provider = new BrowserProvider(wallet.provider)
            const managerAddress = wallet.address

            const network = await provider.getNetwork()
            const chainId = Number(network.chainId)
            const tradingModule = TRADING_MODULE_ADDRESSES[chainId]
            const tokens = TOKENS_BY_CHAIN[chainId]

            if (!tokens) {
                setError(`Chain ${chainId} not supported`)
                return
            }

            // Get client addresses
            const clientAddresses = await getManagerClients(managerAddress)

            // Approximate ETH price for USD calculation
            const ethPriceUSD = 3300 // You could fetch this from an oracle

            // OPTIMIZED: Fetch ALL client details in PARALLEL
            const clientPromises = clientAddresses.map(async (addr) => {
                const delegation = await getDelegation(addr, managerAddress)
                if (!delegation?.isActive) return null

                const code = await provider.getCode(addr)
                const walletType: 'safe' | 'eoa' = code && code !== '0x' ? 'safe' : 'eoa'

                let usdcBalance = '0'
                let wethBalance = '0'
                let clientValue = 0

                try {
                    const balancePromises: Promise<any>[] = []

                    if (tokens.USDC?.address) {
                        const usdcContract = new Contract(tokens.USDC.address, ERC20_ABI, provider)
                        balancePromises.push(usdcContract.balanceOf(addr))
                    } else {
                        balancePromises.push(Promise.resolve(0n))
                    }

                    if (tokens.WETH?.address) {
                        const wethContract = new Contract(tokens.WETH.address, ERC20_ABI, provider)
                        balancePromises.push(wethContract.balanceOf(addr))
                    } else {
                        balancePromises.push(Promise.resolve(0n))
                    }

                    const [usdcBal, wethBal] = await Promise.all(balancePromises)

                    if (tokens.USDC) {
                        usdcBalance = formatUnits(usdcBal, tokens.USDC.decimals)
                        clientValue += parseFloat(usdcBalance)
                    }
                    if (tokens.WETH) {
                        wethBalance = formatUnits(wethBal, tokens.WETH.decimals)
                        clientValue += parseFloat(wethBalance) * ethPriceUSD
                    }
                } catch (err) {
                    console.warn('Failed to get balances for', addr)
                }

                return {
                    address: addr,
                    walletType,
                    usdcBalance,
                    wethBalance,
                    totalValue: clientValue,
                }
            })

            // Execute all client fetches in parallel
            const clientResults = await Promise.all(clientPromises)

            // Filter out null results and count by type
            const clientList: ClientInfo[] = []
            let safeCount = 0
            let eoaCount = 0

            for (const client of clientResults) {
                if (!client) continue
                clientList.push(client)
                if (client.walletType === 'safe') safeCount++
                else eoaCount++
            }

            // Count trades by querying fee transfers to Treasury
            // OPTIMIZED: Query ALL tokens in PARALLEL for faster syncing
            let totalTrades = 0
            let totalVolumeUSD = 0
            const currentBlock = await provider.getBlockNumber()
            // Use same block range as ExecutionDetails (500k blocks for ~1-2 days on Arbitrum)
            const fromBlock = Math.max(0, currentBlock - 500000)

            // Approximate prices for USD calculation
            const tokenPrices: Record<string, number> = {
                USDC: 1,
                USDT: 1,
                WETH: ethPriceUSD,
            }

            // Track seen transactions to avoid double-counting batch trades
            const seenTxHashes = new Set<string>()

            if (tradingModule) {
                // PARALLEL QUERIES: Create all query promises first
                const queryPromises: Promise<{
                    symbol: string;
                    decimals: number;
                    events: any[];
                    client: string;
                }>[] = []

                for (const [symbol, token] of Object.entries(tokens)) {
                    if (!token.address || token.address === '0na') continue

                    const tokenContract = new Contract(token.address, ERC20_ABI, provider)

                    for (const client of clientAddresses) {
                        queryPromises.push(
                            tokenContract
                                .queryFilter(tokenContract.filters.Transfer(client, TREASURY_ADDRESS), fromBlock, 'latest')
                                .then(events => ({ symbol, decimals: token.decimals, events, client }))
                                .catch(() => ({ symbol, decimals: token.decimals, events: [], client }))
                        )
                    }
                }

                // Execute all queries in parallel (much faster!)
                const results = await Promise.all(queryPromises)

                // Process results and batch fetch receipts
                const eventsToProcess: { event: any; symbol: string; decimals: number; client: string }[] = []

                for (const result of results) {
                    for (const event of result.events) {
                        eventsToProcess.push({
                            event,
                            symbol: result.symbol,
                            decimals: result.decimals,
                            client: result.client,
                        })
                    }
                }

                // Batch fetch receipts in parallel (max 10 at a time to avoid rate limits)
                const batchSize = 10
                for (let i = 0; i < eventsToProcess.length; i += batchSize) {
                    const batch = eventsToProcess.slice(i, i + batchSize)
                    const receipts = await Promise.all(
                        batch.map(item => item.event.getTransactionReceipt().catch(() => null))
                    )

                    for (let j = 0; j < batch.length; j++) {
                        const { event, symbol, decimals, client } = batch[j]
                        const receipt = receipts[j]

                        if (!receipt || receipt.to?.toLowerCase() !== tradingModule.toLowerCase()) continue

                        // Create unique key for this execution (tx + client + token)
                        const execKey = `${event.transactionHash}-${client}-${symbol}`

                        // Skip if already counted
                        if (seenTxHashes.has(execKey)) continue
                        seenTxHashes.add(execKey)

                        totalTrades++
                        const log = event as any
                        const feeAmount = log.args?.[2] || 0n
                        // Calculate volume from fee
                        const volume = (feeAmount * 10000n) / BigInt(PLATFORM_FEE_BPS)
                        const volumeInToken = parseFloat(formatUnits(volume, decimals))
                        const priceUSD = tokenPrices[symbol] || 1
                        totalVolumeUSD += volumeInToken * priceUSD
                    }
                }
            }

            setClients(clientList)
            setSummary({
                totalClients: clientList.length,
                safeClients: safeCount,
                eoaClients: eoaCount,
                totalTrades,
                totalVolumeUSD,
                unrealizedPnL: 0, // TODO: Calculate from entry prices
                realizedPnL: 0,   // TODO: Track closed positions
            })
        } catch (err: any) {
            console.error('Failed to load summary:', err)
            setError(err.message || 'Failed to load summary data')
        } finally {
            setIsLoading(false)
        }
    }, [getManagerClients, getDelegation, wallet])

    useEffect(() => {
        loadData()
        const interval = setInterval(loadData, 30000) // Poll every 30s
        return () => clearInterval(interval)
    }, [loadData])

    const shortenAddress = (addr: string) => `${addr.substring(0, 8)}...${addr.substring(addr.length - 6)}`

    const formatUSD = (value: number) => {
        return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
    }

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Typography variant="h5" fontWeight={600}>
                        Summary
                    </Typography>
                    <Chip
                        label="Syncing"
                        size="small"
                        color="success"
                        variant="outlined"
                        avatar={<CircularProgress size={10} color="success" />}
                    />
                </Box>
                <Button
                    startIcon={isLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
                    onClick={loadData}
                    disabled={isLoading}
                >
                    Refresh
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Key Metrics */}
            <Grid container spacing={2} mb={4}>
                <Grid item xs={6} md={3}>
                    <Paper sx={{ p: 2, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
                        <GroupIcon sx={{ fontSize: 32, color: 'primary.main', mb: 1 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Total Clients
                        </Typography>
                        {isLoading ? (
                            <Skeleton variant="text" width={60} />
                        ) : (
                            <Typography variant="h5" fontWeight={700}>
                                {summary.totalClients}
                            </Typography>
                        )}
                    </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                    <Paper sx={{ p: 2, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
                        <AccountBalanceWalletIcon sx={{ fontSize: 32, color: 'info.main', mb: 1 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Safe / EOA
                        </Typography>
                        {isLoading ? (
                            <Skeleton variant="text" width={60} />
                        ) : (
                            <Typography variant="h5" fontWeight={700}>
                                {summary.safeClients} / {summary.eoaClients}
                            </Typography>
                        )}
                    </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                    <Paper sx={{ p: 2, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
                        <SwapHorizIcon sx={{ fontSize: 32, color: 'warning.main', mb: 1 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Total Trades
                        </Typography>
                        {isLoading ? (
                            <Skeleton variant="text" width={60} />
                        ) : (
                            <Typography variant="h5" fontWeight={700}>
                                {summary.totalTrades}
                            </Typography>
                        )}
                    </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                    <Paper sx={{ p: 2, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
                        <TrendingUpIcon sx={{ fontSize: 32, color: 'success.main', mb: 1 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Total Volume
                        </Typography>
                        {isLoading ? (
                            <Skeleton variant="text" width={80} />
                        ) : (
                            <Typography variant="h5" fontWeight={700} color="success.main">
                                {formatUSD(summary.totalVolumeUSD)}
                            </Typography>
                        )}
                    </Paper>
                </Grid>
            </Grid>

            <Grid container spacing={3}>
                {/* Client Assets */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="subtitle1" fontWeight={600} mb={2}>
                            Client Wallets
                        </Typography>
                        {isLoading ? (
                            <Box>
                                <Skeleton variant="text" />
                                <Skeleton variant="text" />
                                <Skeleton variant="text" />
                            </Box>
                        ) : clients.length === 0 ? (
                            <Alert severity="info">
                                No active clients. Share your onboarding link to get started.
                            </Alert>
                        ) : (
                            clients.map((client, i) => (
                                <Box key={client.address}>
                                    <Box display="flex" justifyContent="space-between" alignItems="center" py={1.5}>
                                        <Box>
                                            <Typography variant="body2" fontWeight={500} fontFamily="monospace">
                                                {shortenAddress(client.address)}
                                            </Typography>
                                            <Chip
                                                size="small"
                                                label={client.walletType === 'safe' ? 'Safe' : 'Smart Account'}
                                                color={client.walletType === 'safe' ? 'info' : 'warning'}
                                                variant="outlined"
                                                sx={{ mt: 0.5 }}
                                            />
                                        </Box>
                                        <Box textAlign="right">
                                            <Typography variant="body2" fontWeight={600}>
                                                {formatUSD(client.totalValue)}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {parseFloat(client.usdcBalance).toFixed(2)} USDC + {parseFloat(client.wethBalance).toFixed(6)} WETH
                                            </Typography>
                                        </Box>
                                    </Box>
                                    {i < clients.length - 1 && <Divider />}
                                </Box>
                            ))
                        )}
                    </Paper>
                </Grid>

                {/* Performance */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="subtitle1" fontWeight={600} mb={2}>
                            Performance
                        </Typography>
                        <Box py={1.5}>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2">Unrealized PnL</Typography>
                                <Typography variant="body2" fontWeight={600} color="text.secondary">
                                    Coming Soon
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                Track entry prices to calculate unrealized gains
                            </Typography>
                        </Box>
                        <Divider />
                        <Box py={1.5}>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2">Realized PnL</Typography>
                                <Typography variant="body2" fontWeight={600} color="text.secondary">
                                    Coming Soon
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                From closed positions and completed trades
                            </Typography>
                        </Box>
                        <Divider />
                        <Box py={1.5}>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2">Total Volume Traded</Typography>
                                <Typography variant="body2" fontWeight={600}>
                                    {isLoading ? <Skeleton width={60} /> : formatUSD(summary.totalVolumeUSD)}
                                </Typography>
                            </Box>
                        </Box>
                        <Divider />
                        <Box py={1.5}>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2">Total Transactions</Typography>
                                <Chip size="small" label={summary.totalTrades} color="primary" />
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    )
}
