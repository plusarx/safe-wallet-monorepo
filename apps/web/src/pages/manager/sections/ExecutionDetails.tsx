'use client'

import { useState, useEffect, useCallback } from 'react'
import { BrowserProvider, Contract, formatUnits } from 'ethers'
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    IconButton,
    TextField,
    InputAdornment,
    Tabs,
    Tab,
    CircularProgress,
    Alert,
    Button,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RefreshIcon from '@mui/icons-material/Refresh'
import { TRADING_MODULE_ADDRESSES, TOKENS_BY_CHAIN } from '../../../contracts/TradingModule'
import { useDelegationModule } from '../../../hooks/useDelegationModule'

interface ExecutionRecord {
    txHash: string
    timestamp: Date
    type: 'swap' | 'batch'
    tokenIn: string
    tokenOut: string
    amountIn: string
    feeAmount: string
    safe: string
    status: 'success' | 'pending' | 'failed'
    blockNumber: number
}

// ABI for Transfer event
const ERC20_ABI = [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
]

// Platform fee: 10 bps = 0.1%
const PLATFORM_FEE_BPS = 10

import useWallet from '@/hooks/wallets/useWallet'

export default function ExecutionDetails() {
    const wallet = useWallet()
    const [searchQuery, setSearchQuery] = useState('')
    const [tabValue, setTabValue] = useState(0)
    const [executions, setExecutions] = useState<ExecutionRecord[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { getManagerClients } = useDelegationModule()

    const loadExecutions = useCallback(async () => {
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

            if (!tradingModule || !tokens) {
                setError(`Chain ${chainId} not supported`)
                return
            }

            // Get client addresses
            const clientsResult = await getManagerClients(managerAddress)
            const clients = Array.from(clientsResult)

            if (clients.length === 0) {
                setExecutions([])
                return
            }

            const currentBlock = await provider.getBlockNumber()
            // Query more blocks to ensure we catch all trades
            // Arbitrum blocks are fast (~0.25s). 500k = 1.5 days. 10M = 30 days.
            const isArbitrum = chainId === 42161
            // REDUCED LOOKBACK to avoid RPC timeouts/limits while debugging
            const lookback = isArbitrum ? 2_000_000 : 500_000
            const fromBlock = Math.max(0, currentBlock - lookback)

            const executionRecords: ExecutionRecord[] = []


            // Treasury address for fee detection
            const TREASURY = '0x9FFc3Ad75A809EAAF2115140d81F34Fcf190feCb'.toLowerCase()

            // OPTIMIZED: Query ALL tokens/clients in PARALLEL
            const queryPromises: Promise<{
                symbol: string;
                decimals: number;
                events: any[];
                client: string;
            }>[] = []

            for (const [symbol, token] of Object.entries(tokens)) {
                if (!token.address || token.address === '0na') continue
                const tokenContract = new Contract(token.address, ERC20_ABI, provider)

                for (const client of clients) {
                    queryPromises.push(
                        tokenContract
                            .queryFilter(tokenContract.filters.Transfer(client, TREASURY), fromBlock, 'latest')
                            .then(events => ({ symbol, decimals: token.decimals, events, client }))
                            .catch((err) => {
                                console.error('DEBUG: ExecDetails query failed', { symbol, client, err })
                                return { symbol, decimals: token.decimals, events: [], client }
                            })
                    )
                }
            }

            // Execute all queries in parallel
            const results = await Promise.all(queryPromises)

            // Collect all events to process
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

            // Batch fetch receipts and blocks in parallel (max 10 at a time)
            const batchSize = 10
            for (let i = 0; i < eventsToProcess.length; i += batchSize) {
                const batch = eventsToProcess.slice(i, i + batchSize)
                const [receipts, blocks] = await Promise.all([
                    Promise.all(batch.map(item => item.event.getTransactionReceipt().catch(() => null))),
                    Promise.all(batch.map(item => item.event.getBlock().catch(() => null)))
                ])

                for (let j = 0; j < batch.length; j++) {
                    const { event, symbol, decimals, client } = batch[j]
                    const receipt = receipts[j]
                    const block = blocks[j]

                    if (!receipt || receipt.to?.toLowerCase() !== tradingModule.toLowerCase()) continue
                    if (!block) continue

                    const log = event as any
                    const feeAmount = log.args?.[2] || 0n
                    const amountIn = (feeAmount * 10000n) / BigInt(PLATFORM_FEE_BPS)

                    const tokenOut = symbol === 'USDC' ? 'WETH' :
                        symbol === 'WETH' ? 'USDC' :
                            symbol === 'USDT' ? 'WETH' : 'USDC'

                    // Check if already added
                    const existing = executionRecords.find(e =>
                        e.txHash === event.transactionHash &&
                        e.safe === client &&
                        e.tokenIn === symbol
                    )
                    if (existing) continue

                    // Count batch trades (multiple fee transfers in same tx)
                    const allFeesInTx = eventsToProcess.filter(e =>
                        e.event.transactionHash === event.transactionHash
                    )
                    const isBatch = allFeesInTx.length > 1

                    executionRecords.push({
                        txHash: event.transactionHash,
                        timestamp: new Date(block.timestamp * 1000),
                        type: isBatch ? 'batch' : 'swap',
                        tokenIn: symbol,
                        tokenOut,
                        amountIn: formatUnits(amountIn, decimals),
                        feeAmount: formatUnits(feeAmount, decimals),
                        safe: client,
                        status: receipt?.status === 1 ? 'success' : 'failed',
                        blockNumber: event.blockNumber,
                    })
                }
            }

            // Sort by block number descending (newest first)
            executionRecords.sort((a, b) => b.blockNumber - a.blockNumber)

            setExecutions(executionRecords)
        } catch (err: any) {
            console.error('Failed to load executions:', err)
            setError(err.message || 'Failed to load execution history')
        } finally {
            setIsLoading(false)
        }
    }, [getManagerClients, wallet])

    useEffect(() => {
        loadExecutions()
        const interval = setInterval(loadExecutions, 15000) // Poll every 15s
        return () => clearInterval(interval)
    }, [loadExecutions])

    const filteredExecutions = executions.filter(
        (exec) =>
            exec.safe.toLowerCase().includes(searchQuery.toLowerCase()) ||
            exec.tokenIn.toLowerCase().includes(searchQuery.toLowerCase()) ||
            exec.txHash.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'success': return 'success'
            case 'pending': return 'warning'
            case 'failed': return 'error'
            default: return 'default'
        }
    }

    const shortenAddress = (addr: string) => `${addr.substring(0, 8)}...${addr.substring(addr.length - 6)}`
    const shortenHash = (hash: string) => `${hash.substring(0, 10)}...${hash.substring(hash.length - 6)}`

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Typography variant="h5" fontWeight={600}>
                        Execution Details
                    </Typography>
                    <Chip
                        label="Live Updates"
                        size="small"
                        color="success"
                        variant="outlined"
                        avatar={<CircularProgress size={10} color="success" />}
                    />
                </Box>
                <Button
                    startIcon={isLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
                    onClick={loadExecutions}
                    disabled={isLoading}
                >
                    Refresh
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Paper sx={{ mb: 3 }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
                    <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                        <Tab label={`All (${executions.length})`} />
                        <Tab label={`Success (${executions.filter(e => e.status === 'success').length})`} />
                        <Tab label={`Failed (${executions.filter(e => e.status === 'failed').length})`} />
                    </Tabs>
                </Box>

                <Box p={2}>
                    <TextField
                        size="small"
                        placeholder="Search by client, token, or tx hash..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        sx={{ width: 350 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" />
                                </InputAdornment>
                            ),
                        }}
                    />
                </Box>

                {isLoading ? (
                    <Box display="flex" justifyContent="center" py={4}>
                        <CircularProgress />
                    </Box>
                ) : executions.length === 0 ? (
                    <Alert severity="info" sx={{ m: 2 }}>
                        No executions found. Execute a trade from the Trading Terminal to see history here.
                    </Alert>
                ) : (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Timestamp</TableCell>
                                    <TableCell>Client</TableCell>
                                    <TableCell>Type</TableCell>
                                    <TableCell>Trade</TableCell>
                                    <TableCell align="right">Amount</TableCell>
                                    <TableCell align="right">Fee</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredExecutions
                                    .filter((exec) => {
                                        if (tabValue === 1) return exec.status === 'success'
                                        if (tabValue === 2) return exec.status === 'failed'
                                        return true
                                    })
                                    .map((exec, idx) => (
                                        <TableRow key={`${exec.txHash}-${exec.safe}-${idx}`} hover>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {exec.timestamp.toLocaleString()}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                                                    {shortenHash(exec.txHash)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontFamily="monospace">
                                                    {shortenAddress(exec.safe)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    label={exec.type}
                                                    color={exec.type === 'batch' ? 'secondary' : 'primary'}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    label={`${exec.tokenIn} → ${exec.tokenOut}`}
                                                    color="default"
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2" fontWeight={600}>
                                                    {parseFloat(exec.amountIn).toLocaleString(undefined, { maximumFractionDigits: 6 })} {exec.tokenIn}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="caption" color="text.secondary">
                                                    {parseFloat(exec.feeAmount).toFixed(6)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip size="small" label={exec.status} color={getStatusColor(exec.status) as any} />
                                            </TableCell>
                                            <TableCell>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => window.open(`https://arbiscan.io/tx/${exec.txHash}`, '_blank')}
                                                >
                                                    <OpenInNewIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>
        </Box>
    )
}
