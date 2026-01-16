'use client'

import { useState, useEffect } from 'react'
import { BrowserProvider } from 'ethers'
import {
    Box,
    Typography,
    Paper,
    Grid,
    Card,
    CardContent,
    Chip,
    Button,
    TextField,
    Alert,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    CircularProgress,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    InputAdornment,
    Tabs,
    Tab,
    Checkbox,
    FormControlLabel,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DeleteIcon from '@mui/icons-material/Delete'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import BarChartIcon from '@mui/icons-material/BarChart'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import GpsFixedIcon from '@mui/icons-material/GpsFixed'
import PeopleIcon from '@mui/icons-material/People'
import { useTradingModule } from '../../../hooks/useTradingModule'
import { useDelegationModule } from '../../../hooks/useDelegationModule'
import { TOKENS_BY_CHAIN, FEE_TIERS } from '../../../contracts/TradingModule'
import useWallet from '@/hooks/wallets/useWallet'


interface TriggerOrder {
    id: string
    type: 'limit' | 'stop-market' | 'stop-limit'
    clientAddresses: string[]
    tokenIn: string
    tokenOut: string
    amountIn: string
    triggerPrice: string
    limitPrice?: string
    triggerCondition: 'above' | 'below'
    status: 'pending' | 'triggered' | 'filled' | 'cancelled' | 'failed' | 'partial'
    createdAt: Date
    triggeredAt?: Date
    filledAt?: Date
    filledCount?: number
}

type OrderType = 'limit' | 'stop-market' | 'stop-limit'

interface OrderTypeInfo {
    id: OrderType
    name: string
    fullName: string
    description: string
    icon: React.ReactNode
}

const orderTypes: OrderTypeInfo[] = [
    {
        id: 'limit',
        name: 'Limit',
        fullName: 'Limit Order',
        description: 'Executes at specified price or better',
        icon: <BarChartIcon fontSize="small" />,
    },
    {
        id: 'stop-market',
        name: 'SL-Market',
        fullName: 'Stop-Loss Market',
        description: 'Triggers market order at stop price',
        icon: <NotificationsActiveIcon fontSize="small" />,
    },
    {
        id: 'stop-limit',
        name: 'SL-Limit',
        fullName: 'Stop-Loss Limit',
        description: 'Triggers limit order at stop price',
        icon: <GpsFixedIcon fontSize="small" />,
    },
]

const ORDERS_KEY = 'trading_trigger_orders'

export default function OrderTypes() {
    const [selectedType, setSelectedType] = useState<OrderType>('limit')
    const [isLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState('')
    const [tabValue, setTabValue] = useState(0)

    const [chainId, setChainId] = useState(42161)
    const [clients, setClients] = useState<string[]>([])

    // Multi-client selection
    const [selectedClients, setSelectedClients] = useState<string[]>([])

    const [tokenIn, setTokenIn] = useState('USDC')
    const [tokenOut, setTokenOut] = useState('WETH')
    const [amountIn, setAmountIn] = useState('')
    const [triggerPrice, setTriggerPrice] = useState('')
    const [limitPrice, setLimitPrice] = useState('')
    const [triggerCondition, setTriggerCondition] = useState<'above' | 'below'>('below')

    const [orders, setOrders] = useState<TriggerOrder[]>([])
    const [isMonitoring, setIsMonitoring] = useState(false)

    const { executeTrade, executeBatchTrade, getQuote } = useTradingModule()
    const { getManagerClients } = useDelegationModule()
    const wallet = useWallet()

    useEffect(() => {
        const loadData = async () => {
            if (typeof window === 'undefined' || !window.ethereum) return
            if (!wallet?.address) return

            try {
                const provider = new BrowserProvider(window.ethereum as any)

                const network = await provider.getNetwork()
                setChainId(Number(network.chainId))

                const clientList = await getManagerClients(wallet.address)
                setClients(clientList)

                const saved = localStorage.getItem(ORDERS_KEY)
                if (saved) {
                    const parsed = JSON.parse(saved)
                    const restoredOrders = parsed.map((o: any) => ({
                        ...o,
                        createdAt: new Date(o.createdAt),
                        triggeredAt: o.triggeredAt ? new Date(o.triggeredAt) : undefined,
                        filledAt: o.filledAt ? new Date(o.filledAt) : undefined,
                    }))
                    setOrders(restoredOrders)
                }
            } catch (err) {
                console.error('Failed to load data:', err)
            }
        }

        loadData()
    }, [getManagerClients, wallet])

    useEffect(() => {
        if (orders.length > 0) {
            localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
        }
    }, [orders])


    // Monitor orders
    useEffect(() => {
        const pendingOrders = orders.filter(o => o.status === 'pending')
        if (pendingOrders.length === 0) {
            setIsMonitoring(false)
            return
        }

        setIsMonitoring(true)

        const checkOrders = async () => {
            const tokens = TOKENS_BY_CHAIN[chainId]
            if (!tokens) return

            for (const order of pendingOrders) {
                try {
                    const tokenInData = tokens[order.tokenIn]
                    const tokenOutData = tokens[order.tokenOut]
                    if (!tokenInData || !tokenOutData) continue

                    const quote = await getQuote(
                        tokenInData.address,
                        tokenOutData.address,
                        '1',
                        tokenInData.decimals,
                        tokenOutData.decimals,
                        FEE_TIERS.MEDIUM
                    )

                    const currentPriceNum = parseFloat(quote)
                    const triggerPriceNum = parseFloat(order.triggerPrice)

                    const isTriggered = order.triggerCondition === 'below'
                        ? currentPriceNum <= triggerPriceNum
                        : currentPriceNum >= triggerPriceNum

                    if (isTriggered) {
                        console.log(`Order ${order.id} triggered!`)

                        setOrders(prev => prev.map(o =>
                            o.id === order.id ? { ...o, status: 'triggered' as const, triggeredAt: new Date() } : o
                        ))

                        let minAmountOut: string
                        if (order.type === 'stop-market') {
                            const expectedOutput = parseFloat(order.amountIn) * currentPriceNum
                            minAmountOut = (expectedOutput * 0.99).toFixed(tokenOutData.decimals)
                        } else if (order.type === 'stop-limit' && order.limitPrice) {
                            const expectedOutput = parseFloat(order.amountIn) * parseFloat(order.limitPrice)
                            minAmountOut = expectedOutput.toFixed(tokenOutData.decimals)
                        } else {
                            const expectedOutput = parseFloat(order.amountIn) * triggerPriceNum
                            minAmountOut = (expectedOutput * 0.99).toFixed(tokenOutData.decimals)
                        }

                        try {
                            // Execute for all clients (batch if multiple)
                            if (order.clientAddresses.length === 1) {
                                await executeTrade({
                                    safe: order.clientAddresses[0],
                                    tokenIn: tokenInData.address,
                                    tokenOut: tokenOutData.address,
                                    amountIn: order.amountIn,
                                    minAmountOut,
                                    feeTier: FEE_TIERS.MEDIUM,
                                    deadline: Math.floor(Date.now() / 1000) + 600,
                                    tokenInDecimals: tokenInData.decimals,
                                    tokenOutDecimals: tokenOutData.decimals,
                                })
                            } else {
                                await executeBatchTrade({
                                    safes: order.clientAddresses,
                                    tokenIn: tokenInData.address,
                                    tokenOut: tokenOutData.address,
                                    amounts: order.clientAddresses.map(() => order.amountIn),
                                    minAmountOut,
                                    feeTier: FEE_TIERS.MEDIUM,
                                    deadline: Math.floor(Date.now() / 1000) + 600,
                                    tokenInDecimals: tokenInData.decimals,
                                    tokenOutDecimals: tokenOutData.decimals,
                                })
                            }

                            setOrders(prev => prev.map(o =>
                                o.id === order.id ? { ...o, status: 'filled' as const, filledAt: new Date(), filledCount: order.clientAddresses.length } : o
                            ))

                            setSuccessMessage(`Order filled for ${order.clientAddresses.length} client(s)!`)
                        } catch (execErr) {
                            console.error('Failed to execute order:', execErr)
                            setOrders(prev => prev.map(o =>
                                o.id === order.id ? { ...o, status: 'failed' as const } : o
                            ))
                            setError(`Order execution failed`)
                        }
                    }
                } catch (err) {
                    console.warn(`Failed to check order ${order.id}:`, err)
                }
            }
        }

        const interval = setInterval(checkOrders, 15000)
        checkOrders()

        return () => clearInterval(interval)
    }, [orders, chainId, getQuote, executeTrade, executeBatchTrade])

    const handleSelectAllClients = () => {
        if (selectedClients.length === clients.length) {
            setSelectedClients([])
        } else {
            setSelectedClients([...clients])
        }
    }

    const handleClientToggle = (client: string) => {
        setSelectedClients(prev =>
            prev.includes(client)
                ? prev.filter(c => c !== client)
                : [...prev, client]
        )
    }

    const handleCreateOrder = async () => {
        if (selectedClients.length === 0 || !amountIn || !triggerPrice) {
            setError('Please select at least one client and fill in all fields')
            return
        }

        if (selectedType === 'stop-limit' && !limitPrice) {
            setError('Limit price is required for Stop-Limit orders')
            return
        }

        setError(null)

        const newOrder: TriggerOrder = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: selectedType,
            clientAddresses: [...selectedClients],
            tokenIn,
            tokenOut,
            amountIn,
            triggerPrice,
            limitPrice: selectedType === 'stop-limit' ? limitPrice : undefined,
            triggerCondition,
            status: 'pending',
            createdAt: new Date(),
        }

        setOrders(prev => [...prev, newOrder])
        setSuccessMessage(`Order created for ${selectedClients.length} client(s)!`)

        setAmountIn('')
        setTriggerPrice('')
        setLimitPrice('')
    }

    const handleDeleteOrder = (orderId: string) => {
        setOrders(prev => prev.filter(o => o.id !== orderId))
    }

    const tokens = TOKENS_BY_CHAIN[chainId] || {}
    const tokenList = Object.keys(tokens)
    const pendingOrders = orders.filter(o => o.status === 'pending')
    const filledOrders = orders.filter(o => o.status === 'filled' || o.status === 'triggered')
    const failedOrders = orders.filter(o => o.status === 'failed' || o.status === 'cancelled')

    const shortenAddress = (addr: string) => `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`

    const getOrderTypeLabel = (type: string) => {
        switch (type) {
            case 'limit': return 'Limit'
            case 'stop-market': return 'SL-M'
            case 'stop-limit': return 'SL-L'
            default: return type
        }
    }

    const selectedOrder = orderTypes.find(o => o.id === selectedType)

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h5" fontWeight={600}>
                    Order Types
                </Typography>
                {isMonitoring && (
                    <Chip
                        label={`Monitoring ${pendingOrders.length} order(s)`}
                        color="warning"
                        size="small"
                        icon={<CircularProgress size={12} color="inherit" />}
                    />
                )}
            </Box>

            <Grid container spacing={3}>
                {/* Order Type Selection */}
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle2" fontWeight={600} mb={2}>
                            Select Order Type
                        </Typography>
                        <Box display="flex" flexDirection="column" gap={1}>
                            {orderTypes.map((order) => (
                                <Card
                                    key={order.id}
                                    variant="outlined"
                                    onClick={() => setSelectedType(order.id)}
                                    sx={{
                                        cursor: 'pointer',
                                        borderColor: selectedType === order.id ? 'primary.main' : 'divider',
                                        bgcolor: selectedType === order.id ? 'action.selected' : 'transparent',
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            borderColor: 'primary.main',
                                            bgcolor: 'action.hover',
                                        },
                                    }}
                                >
                                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                        <Box display="flex" alignItems="flex-start" gap={1.5}>
                                            <Box sx={{ color: selectedType === order.id ? 'primary.main' : 'text.secondary', mt: 0.25 }}>
                                                {order.icon}
                                            </Box>
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight={600}>
                                                    {order.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                                                    {order.description}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            ))}
                        </Box>
                    </Paper>
                </Grid>

                {/* Order Configuration */}
                <Grid item xs={12} md={9}>
                    <Paper sx={{ p: 3 }}>
                        <Box mb={2}>
                            <Typography variant="h6" fontWeight={600}>
                                {selectedOrder?.fullName}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {selectedType === 'limit' && 'Executes at the selected limit price or better'}
                                {selectedType === 'stop-market' && 'Triggers a market order when price hits the stop level'}
                                {selectedType === 'stop-limit' && 'Triggers a limit order when price hits the stop'}
                            </Typography>
                        </Box>

                        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
                        {successMessage && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>{successMessage}</Alert>}

                        {/* Client Selection */}
                        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, mb: 2 }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <PeopleIcon fontSize="small" color="action" />
                                    <Typography variant="subtitle2" fontWeight={600}>
                                        Select Clients
                                    </Typography>
                                    {selectedClients.length > 0 && (
                                        <Chip
                                            label={`${selectedClients.length} selected`}
                                            size="small"
                                            color="primary"
                                        />
                                    )}
                                </Box>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={selectedClients.length === clients.length && clients.length > 0}
                                            indeterminate={selectedClients.length > 0 && selectedClients.length < clients.length}
                                            onChange={handleSelectAllClients}
                                            size="small"
                                        />
                                    }
                                    label={<Typography variant="body2">Select All</Typography>}
                                />
                            </Box>
                            <Box display="flex" flexWrap="wrap" gap={1}>
                                {clients.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">
                                        No clients found. Add clients via Onboarding Links.
                                    </Typography>
                                ) : (
                                    clients.map((client) => (
                                        <Chip
                                            key={client}
                                            label={shortenAddress(client)}
                                            onClick={() => handleClientToggle(client)}
                                            color={selectedClients.includes(client) ? 'primary' : 'default'}
                                            variant={selectedClients.includes(client) ? 'filled' : 'outlined'}
                                            sx={{ fontFamily: 'monospace', cursor: 'pointer' }}
                                        />
                                    ))
                                )}
                            </Box>
                        </Box>

                        {/* Trade Configuration */}
                        <Grid container spacing={2} alignItems="flex-end">
                            <Grid item xs={6} sm={3}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Sell</InputLabel>
                                    <Select
                                        value={tokenIn}
                                        label="Sell"
                                        onChange={(e) => setTokenIn(e.target.value)}
                                    >
                                        {tokenList.map((t) => (
                                            <MenuItem key={t} value={t}>{t}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={6} sm={3}>
                                <TextField
                                    fullWidth
                                    label="Amount"
                                    value={amountIn}
                                    onChange={(e) => setAmountIn(e.target.value)}
                                    placeholder="0.00"
                                    size="small"
                                    type="number"
                                    InputProps={{
                                        endAdornment: <InputAdornment position="end">{tokenIn}</InputAdornment>,
                                    }}
                                />
                            </Grid>

                            <Grid item xs={6} sm={3}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Buy</InputLabel>
                                    <Select
                                        value={tokenOut}
                                        label="Buy"
                                        onChange={(e) => setTokenOut(e.target.value)}
                                    >
                                        {tokenList.filter(t => t !== tokenIn).map((t) => (
                                            <MenuItem key={t} value={t}>{t}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={6} sm={3}>
                                <TextField
                                    fullWidth
                                    label={selectedType === 'limit' ? 'Limit Price' : 'Trigger Price'}
                                    value={triggerPrice}
                                    onChange={(e) => setTriggerPrice(e.target.value)}
                                    placeholder="0.00"
                                    size="small"
                                    type="number"
                                    InputProps={{
                                        endAdornment: <InputAdornment position="end">{tokenOut}</InputAdornment>,
                                    }}
                                />
                            </Grid>

                            {/* SL-Limit: Min Price */}
                            {selectedType === 'stop-limit' && (
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        fullWidth
                                        label="Min Receive Price"
                                        value={limitPrice}
                                        onChange={(e) => setLimitPrice(e.target.value)}
                                        placeholder="0.00"
                                        size="small"
                                        type="number"
                                        InputProps={{
                                            endAdornment: <InputAdornment position="end">{tokenOut}</InputAdornment>,
                                        }}
                                        helperText="Order won't execute below this price"
                                    />
                                </Grid>
                            )}

                            {/* Trigger condition - only for stop orders */}
                            {selectedType !== 'limit' && (
                                <Grid item xs={12} sm={selectedType === 'stop-limit' ? 6 : 12}>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                        Trigger When Price
                                    </Typography>
                                    <Box display="flex" gap={1}>
                                        <Button
                                            variant={triggerCondition === 'below' ? 'contained' : 'outlined'}
                                            color="error"
                                            onClick={() => setTriggerCondition('below')}
                                            startIcon={<TrendingDownIcon />}
                                            sx={{ flex: 1 }}
                                            size="small"
                                        >
                                            Falls Below
                                        </Button>
                                        <Button
                                            variant={triggerCondition === 'above' ? 'contained' : 'outlined'}
                                            color="success"
                                            onClick={() => setTriggerCondition('above')}
                                            startIcon={<TrendingUpIcon />}
                                            sx={{ flex: 1 }}
                                            size="small"
                                        >
                                            Rises Above
                                        </Button>
                                    </Box>
                                </Grid>
                            )}
                        </Grid>

                        {/* Batch Order Info */}
                        {selectedClients.length > 1 && (
                            <Alert severity="info" sx={{ mt: 2 }} icon={<PeopleIcon />}>
                                Batch order will execute for all {selectedClients.length} clients when triggered.
                            </Alert>
                        )}

                        <Box mt={3}>
                            <Button
                                variant="contained"
                                color="primary"
                                startIcon={isLoading ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                                onClick={handleCreateOrder}
                                disabled={isLoading || selectedClients.length === 0 || !amountIn || !triggerPrice}
                                fullWidth
                                size="large"
                            >
                                Create {getOrderTypeLabel(selectedType)} Order
                                {selectedClients.length > 1 && ` (${selectedClients.length} Clients)`}
                            </Button>
                        </Box>
                    </Paper>

                    {/* Orders Tables */}
                    <Paper sx={{ mt: 2 }}>
                        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
                            <Tab label={`Pending (${pendingOrders.length})`} />
                            <Tab label={`Filled (${filledOrders.length})`} />
                            <Tab label={`Failed (${failedOrders.length})`} />
                        </Tabs>

                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Clients</TableCell>
                                        <TableCell>Trade</TableCell>
                                        <TableCell align="right">Amount</TableCell>
                                        <TableCell align="right">Trigger</TableCell>
                                        <TableCell>Condition</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(tabValue === 0 ? pendingOrders : tabValue === 1 ? filledOrders : failedOrders).map((order) => (
                                        <TableRow key={order.id}>
                                            <TableCell>
                                                <Chip
                                                    label={getOrderTypeLabel(order.type)}
                                                    size="small"
                                                    color={order.type === 'stop-market' ? 'error' : order.type === 'stop-limit' ? 'warning' : 'primary'}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {order.clientAddresses.length === 1 ? (
                                                    <Typography variant="body2" fontFamily="monospace" fontSize={11}>
                                                        {shortenAddress(order.clientAddresses[0])}
                                                    </Typography>
                                                ) : (
                                                    <Chip
                                                        label={`${order.clientAddresses.length} clients`}
                                                        size="small"
                                                        icon={<PeopleIcon sx={{ fontSize: 14 }} />}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {order.tokenIn} → {order.tokenOut}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2">
                                                    {order.amountIn}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2">
                                                    {parseFloat(order.triggerPrice).toFixed(4)}
                                                </Typography>
                                                {order.limitPrice && (
                                                    <Typography variant="caption" display="block" color="text.secondary">
                                                        Limit: {parseFloat(order.limitPrice).toFixed(4)}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={order.triggerCondition === 'below' ? 'Below' : 'Above'}
                                                    size="small"
                                                    color={order.triggerCondition === 'below' ? 'error' : 'success'}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={order.status}
                                                    size="small"
                                                    color={
                                                        order.status === 'filled' ? 'success' :
                                                            order.status === 'pending' ? 'warning' :
                                                                order.status === 'triggered' ? 'info' :
                                                                    'error'
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {order.status === 'pending' && (
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleDeleteOrder(order.id)}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(tabValue === 0 ? pendingOrders : tabValue === 1 ? filledOrders : failedOrders).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8} align="center">
                                                <Typography variant="body2" color="text.secondary" py={3}>
                                                    No {tabValue === 0 ? 'pending' : tabValue === 1 ? 'filled' : 'failed'} orders
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    )
}
