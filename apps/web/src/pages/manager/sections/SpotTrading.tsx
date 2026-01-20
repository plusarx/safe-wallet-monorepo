'use client'

import { useState, useEffect } from 'react'
import { BrowserProvider } from 'ethers'
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  IconButton,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Badge,
  Card,
  CardContent,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  InputLabel,
} from '@mui/material'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import RefreshIcon from '@mui/icons-material/Refresh'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import SettingsIcon from '@mui/icons-material/Settings'
import GroupIcon from '@mui/icons-material/Group'
import BarChartIcon from '@mui/icons-material/BarChart'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import GpsFixedIcon from '@mui/icons-material/GpsFixed'
import DeleteIcon from '@mui/icons-material/Delete'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'

import { useTradingModule } from '../../../hooks/useTradingModule'
import { TOKENS, FEE_TIERS, TOKENS_BY_CHAIN } from '../../../contracts/TradingModule'
import useWallet from '@/hooks/wallets/useWallet'
import { useManagerClients } from '@/hooks/manager/useManagerClients'

const DEFAULT_TOKEN_LIST = [
  { symbol: 'WETH', address: TOKENS.WETH.address, decimals: 18 },
  { symbol: 'USDC', address: TOKENS.USDC.address, decimals: 6 },
]

// --- Order Types Interfaces ---

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

export default function SpotTrading() {
  // Use Safe's wallet hook
  const wallet = useWallet()
  const walletAddress = wallet?.address || ''

  // Clients Hook
  const {
    clients,
    isLoading: isLoadingClients,
    refresh: refreshClients,
    toggleClient,
    toggleSelectAll,
  } = useManagerClients(walletAddress)
  const [walletTypeFilter, setWalletTypeFilter] = useState<'all' | 'eoa' | 'safe'>('all')

  // Selected clients for operations
  const selectedClients = clients.filter((c) => c.selected)
  const singleSelectedClient = selectedClients.length === 1 ? selectedClients[0] : null

  // Trading Module
  const {
    isLoading: isTrading,
    error: tradeError,
    executeTrade,
    executeBatchTrade,
    setDailyLimit,
    calculateFee,
    getQuote,
  } = useTradingModule()

  // --- Swap Section State ---
  const [tokenList, setTokenList] = useState(DEFAULT_TOKEN_LIST)
  const [tokenIn, setTokenIn] = useState(DEFAULT_TOKEN_LIST[0]) // WETH
  const [tokenOut, setTokenOut] = useState(DEFAULT_TOKEN_LIST[1]) // USDC
  const [amountIn, setAmountIn] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [quoteAmountOut, setQuoteAmountOut] = useState('')
  const [isQuoting, setIsQuoting] = useState(false)
  const [_estimatedFee, setEstimatedFee] = useState<string>('0')

  // Limit form
  const [newDailyLimit, setNewDailyLimit] = useState('')

  // --- Orders Section State ---
  const [selectedOrderType, setSelectedOrderType] = useState<OrderType>('limit')
  const [orderAmountIn, setOrderAmountIn] = useState('')
  const [orderTriggerPrice, setOrderTriggerPrice] = useState('')
  const [orderLimitPrice, setOrderLimitPrice] = useState('')
  const [triggerCondition, setTriggerCondition] = useState<'above' | 'below'>('below')

  const [orders, setOrders] = useState<TriggerOrder[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [ordersTabValue, setOrdersTabValue] = useState(0)

  // Token list for orders (symbols)
  const [orderTokenIn, setOrderTokenIn] = useState('USDC')
  const [orderTokenOut, setOrderTokenOut] = useState('WETH')

  const [chainId, setChainId] = useState(42161) // Default Arb One

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // --- Effects ---

  // Load Chain Data & Tokens
  useEffect(() => {
    const loadChainData = async () => {
      if (!window.ethereum) return
      try {
        const provider = new BrowserProvider(window.ethereum as any)
        const network = await provider.getNetwork()
        const cId = Number(network.chainId)
        setChainId(cId)

        const tokens = TOKENS_BY_CHAIN[cId]
        if (tokens) {
          const list = Object.values(tokens)
          setTokenList(list)
          // Init Defaults if needed
          if (tokenIn.address !== list.find((t) => t.symbol === tokenIn.symbol)?.address) {
            setTokenIn(list.find((t) => t.symbol === 'WETH') || list[0])
            setTokenOut(list.find((t) => t.symbol === 'USDC') || list[1] || list[0])
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadChainData()
  }, []) // Run once on mount

  // Calculate fee & Quote for Swap
  useEffect(() => {
    if (amountIn && parseFloat(amountIn) > 0) {
      calculateFee(amountIn).then(setEstimatedFee)
      setIsQuoting(true)
      const delayDebounceFn = setTimeout(() => {
        getQuote(tokenIn.address, tokenOut.address, amountIn, FEE_TIERS.MEDIUM, tokenIn.decimals, tokenOut.decimals)
          .then((amount) => {
            setQuoteAmountOut(amount)
            setIsQuoting(false)
          })
          .catch(() => setIsQuoting(false))
      }, 500)
      return () => clearTimeout(delayDebounceFn)
    } else {
      setQuoteAmountOut('')
    }
  }, [amountIn, tokenIn, tokenOut, calculateFee, getQuote])

  // Load Orders from LS
  useEffect(() => {
    if (!walletAddress) return
    const saved = localStorage.getItem(ORDERS_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const restoredOrders = parsed.map((o: any) => ({
          ...o,
          createdAt: new Date(o.createdAt),
          triggeredAt: o.triggeredAt ? new Date(o.triggeredAt) : undefined,
          filledAt: o.filledAt ? new Date(o.filledAt) : undefined,
        }))
        setOrders(restoredOrders)
      } catch (e) {
        console.error('Error loading orders', e)
      }
    }
  }, [walletAddress])

  // Save Orders (Debounced slightly or just on change)
  useEffect(() => {
    if (orders.length > 0) localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
  }, [orders])

  // Monitoring Logic for Orders
  useEffect(() => {
    const pendingOrders = orders.filter((o) => o.status === 'pending')
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
            FEE_TIERS.MEDIUM,
          )

          const currentPriceNum = parseFloat(quote)
          const triggerPriceNum = parseFloat(order.triggerPrice)

          const isTriggered =
            order.triggerCondition === 'below' ? currentPriceNum <= triggerPriceNum : currentPriceNum >= triggerPriceNum

          if (isTriggered) {
            console.log(`Order ${order.id} triggered!`)

            setOrders((prev) =>
              prev.map((o) =>
                o.id === order.id ? { ...o, status: 'triggered' as const, triggeredAt: new Date() } : o,
              ),
            )

            let minAmountOut: string
            if (order.type === 'stop-market') {
              const expectedOutput = parseFloat(order.amountIn) * currentPriceNum
              minAmountOut = (expectedOutput * 0.99).toFixed(tokenOutData.decimals) // 1% Slippage on market trigger
            } else if (order.type === 'stop-limit' && order.limitPrice) {
              const expectedOutput = parseFloat(order.amountIn) * parseFloat(order.limitPrice)
              minAmountOut = expectedOutput.toFixed(tokenOutData.decimals)
            } else {
              // Limit Order Logic (Simplified as Market execution when price met)
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

              setOrders((prev) =>
                prev.map((o) =>
                  o.id === order.id
                    ? {
                        ...o,
                        status: 'filled' as const,
                        filledAt: new Date(),
                        filledCount: order.clientAddresses.length,
                      }
                    : o,
                ),
              )

              setMessage({ type: 'success', text: `Order filled for ${order.clientAddresses.length} client(s)!` })
            } catch (execErr: any) {
              console.error('Failed to execute order:', execErr)
              setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: 'failed' as const } : o)))
              setMessage({ type: 'error', text: `Order execution failed: ${execErr.message || 'Unknown'}` })
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

  // --- Actions ---

  const handleSwapTokens = () => {
    const temp = tokenIn
    setTokenIn(tokenOut)
    setTokenOut(temp)
    setQuoteAmountOut('')
  }

  const handleTrade = async () => {
    if (selectedClients.length === 0 || !amountIn) {
      setMessage({ type: 'error', text: 'Select clients and enter amount' })
      return
    }

    setMessage(null)
    const deadline = Math.floor(Date.now() / 1000) + 600
    const estimatedOutput = quoteAmountOut ? parseFloat(quoteAmountOut) : 0
    const slippagePercent = parseFloat(slippage) / 100
    const calculatedMinOut = (estimatedOutput * (1 - slippagePercent)).toFixed(tokenOut.decimals)

    try {
      if (selectedClients.length === 1) {
        const txHash = await executeTrade({
          safe: selectedClients[0].address,
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn,
          minAmountOut: calculatedMinOut,
          feeTier: FEE_TIERS.MEDIUM,
          deadline,
          tokenInDecimals: tokenIn.decimals,
          tokenOutDecimals: tokenOut.decimals,
        })
        setMessage({ type: 'success', text: `Trade executed! Tx: ${txHash.substring(0, 10)}...` })
      } else {
        const safes = selectedClients.map((c) => c.address)
        const amounts = selectedClients.map(() => amountIn)
        const txHash = await executeBatchTrade({
          safes,
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amounts,
          minAmountOut: calculatedMinOut,
          feeTier: FEE_TIERS.MEDIUM,
          deadline,
          tokenInDecimals: tokenIn.decimals,
          tokenOutDecimals: tokenOut.decimals,
        })
        setMessage({
          type: 'success',
          text: `Batch trade for ${safes.length} clients! Tx: ${txHash.substring(0, 10)}...`,
        })
      }
      setAmountIn('')
    } catch (err: any) {
      console.error('Trade failed:', err)
      setMessage({ type: 'error', text: err.message || 'Trade failed' })
    }
  }

  const handleSetLimit = async () => {
    if (!singleSelectedClient || !newDailyLimit) {
      setMessage({ type: 'error', text: 'Select one client and enter limit' })
      return
    }

    setMessage(null)
    try {
      const txHash = await setDailyLimit(singleSelectedClient.address, newDailyLimit)
      setMessage({ type: 'success', text: `Daily limit set! Tx: ${txHash.substring(0, 10)}...` })
      setNewDailyLimit('')
    } catch (err: any) {
      console.error('Failed to set limit:', err)
      setMessage({ type: 'error', text: err.message || 'Failed to set limit' })
    }
  }

  const handleCreateOrder = async () => {
    if (selectedClients.length === 0 || !orderAmountIn || !orderTriggerPrice) {
      setMessage({ type: 'error', text: 'Please select at least one client and fill in all fields' })
      return
    }

    if (selectedOrderType === 'stop-limit' && !orderLimitPrice) {
      setMessage({ type: 'error', text: 'Limit price is required for Stop-Limit orders' })
      return
    }

    setMessage(null)

    const newOrder: TriggerOrder = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: selectedOrderType,
      clientAddresses: selectedClients.map((c) => c.address),
      tokenIn: orderTokenIn,
      tokenOut: orderTokenOut,
      amountIn: orderAmountIn,
      triggerPrice: orderTriggerPrice,
      limitPrice: selectedOrderType === 'stop-limit' ? orderLimitPrice : undefined,
      triggerCondition,
      status: 'pending',
      createdAt: new Date(),
    }

    setOrders((prev) => [...prev, newOrder])
    setMessage({ type: 'success', text: `Order created for ${selectedClients.length} client(s)!` })

    setOrderAmountIn('')
  }

  const handleDeleteOrder = (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
  }

  const selectedOrder = orderTypes.find((o) => o.id === selectedOrderType)
  const tokenSymbols = tokenList.map((t) => t.symbol)

  // Order Lists
  const pendingOrders = orders.filter((o) => o.status === 'pending')
  const filledOrders = orders.filter((o) => o.status === 'filled' || o.status === 'triggered')
  const failedOrders = orders.filter((o) => o.status === 'failed' || o.status === 'cancelled')

  return (
    <Box>
      {/* Messages */}
      {(message || tradeError) && (
        <Alert
          severity={message?.type === 'success' ? 'success' : 'error'}
          sx={{ mb: 2 }}
          onClose={() => setMessage(null)}
        >
          {message?.text || tradeError}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* --- Left Column: Client Selection --- */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle2" fontWeight={600}>
                <GroupIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Clients
              </Typography>
              <Badge badgeContent={selectedClients.length} color="primary">
                <Chip
                  label={selectedClients.length > 1 ? 'Batch' : 'Single'}
                  size="small"
                  color={selectedClients.length > 1 ? 'primary' : 'default'}
                />
              </Badge>
            </Box>

            {clients.length === 0 ? (
              isLoadingClients ? (
                <CircularProgress size={20} />
              ) : (
                <Alert severity="info">No clients</Alert>
              )
            ) : (
              <>
                <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                  <Chip
                    label="All"
                    size="small"
                    onClick={() => setWalletTypeFilter('all')}
                    color={walletTypeFilter === 'all' ? 'primary' : 'default'}
                    variant={walletTypeFilter === 'all' ? 'filled' : 'outlined'}
                  />
                  <Chip
                    label="Safe"
                    size="small"
                    onClick={() => setWalletTypeFilter('safe')}
                    color={walletTypeFilter === 'safe' ? 'primary' : 'default'}
                    variant={walletTypeFilter === 'safe' ? 'filled' : 'outlined'}
                  />
                  <Chip
                    label="EOA"
                    size="small"
                    onClick={() => setWalletTypeFilter('eoa')}
                    color={walletTypeFilter === 'eoa' ? 'primary' : 'default'}
                    variant={walletTypeFilter === 'eoa' ? 'filled' : 'outlined'}
                  />
                </Box>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={clients
                        .filter((c) => walletTypeFilter === 'all' || c.walletType === walletTypeFilter)
                        .every((c) => c.selected)}
                      onChange={() =>
                        toggleSelectAll(
                          clients.filter((c) => walletTypeFilter === 'all' || c.walletType === walletTypeFilter),
                        )
                      }
                    />
                  }
                  label={<Typography variant="body2">Select All Visible</Typography>}
                />
                <Divider sx={{ my: 1 }} />

                <Box sx={{ maxHeight: 600, overflow: 'auto' }}>
                  {clients
                    .filter((c) => walletTypeFilter === 'all' || c.walletType === walletTypeFilter)
                    .map((client) => (
                      <FormControlLabel
                        key={client.address}
                        control={
                          <Checkbox
                            checked={client.selected}
                            onChange={() => toggleClient(client.address)}
                            size="small"
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {client.address.substring(0, 6)}...{client.address.substring(38)}
                            </Typography>
                            <Box display="flex" gap={0.5}>
                              <Chip
                                label={client.walletType.toUpperCase()}
                                size="small"
                                sx={{ height: 16, fontSize: '0.6rem' }}
                              />
                              {client.approvals?.map((s) => (
                                <Chip
                                  key={s}
                                  label={s}
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                  sx={{ height: 16, fontSize: '0.6rem' }}
                                />
                              ))}
                            </Box>
                          </Box>
                        }
                        sx={{ display: 'flex', mb: 1, alignItems: 'flex-start' }}
                      />
                    ))}
                </Box>
              </>
            )}
            <Button startIcon={<RefreshIcon />} onClick={refreshClients} size="small" fullWidth sx={{ mt: 2 }}>
              Refresh Clients
            </Button>
          </Paper>
        </Grid>

        {/* --- Right Column: Trading Interface --- */}
        <Grid item xs={12} md={9}>
          {/* 1. Swap Section */}
          <Paper sx={{ p: 3, mb: 4 }}>
            <Grid container spacing={4}>
              <Grid item xs={12} md={7}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" fontWeight={600}>
                    Market Swap
                  </Typography>
                  {selectedClients.length > 1 && (
                    <Chip label={`Executing for ${selectedClients.length} clients`} color="primary" size="small" />
                  )}
                </Box>

                {/* Pay */}
                <Paper sx={{ p: 2, mb: 1, bgcolor: 'rgba(255,255,255,0.05)' }}>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="caption" color="text.secondary">
                      You Pay
                    </Typography>
                  </Box>
                  <Box display="flex" gap={2} alignItems="center">
                    <TextField
                      fullWidth
                      variant="standard"
                      placeholder="0.0"
                      value={amountIn}
                      onChange={(e) => setAmountIn(e.target.value)}
                      type="number"
                      InputProps={{ disableUnderline: true, sx: { fontSize: '1.5rem', fontWeight: 500 } }}
                    />
                    <Select
                      value={tokenIn.symbol}
                      variant="standard"
                      disableUnderline
                      sx={{ fontWeight: 600 }}
                      onChange={(e) => {
                        const t = tokenList.find((x) => x.symbol === e.target.value)
                        if (t) {
                          if (t.symbol === tokenOut.symbol) setTokenOut(tokenIn)
                          setTokenIn(t)
                        }
                      }}
                    >
                      {tokenList.map((t) => (
                        <MenuItem key={t.symbol} value={t.symbol}>
                          {t.symbol}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                </Paper>

                <Box display="flex" justifyContent="center" my={-2} position="relative" zIndex={1}>
                  <IconButton
                    onClick={handleSwapTokens}
                    sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
                    size="small"
                  >
                    <SwapVertIcon fontSize="small" />
                  </IconButton>
                </Box>

                {/* Receive */}
                <Paper sx={{ p: 2, mt: 1, bgcolor: 'rgba(255,255,255,0.05)' }}>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="caption" color="text.secondary">
                      You Receive (Estimated)
                    </Typography>
                  </Box>
                  <Box display="flex" gap={2} alignItems="center">
                    <Typography variant="h5" sx={{ flex: 1, color: 'text.secondary' }}>
                      {isQuoting ? '...' : quoteAmountOut ? '~' + parseFloat(quoteAmountOut).toFixed(6) : '0.0'}
                    </Typography>
                    <Select
                      value={tokenOut.symbol}
                      variant="standard"
                      disableUnderline
                      sx={{ fontWeight: 600 }}
                      onChange={(e) => {
                        const t = tokenList.find((x) => x.symbol === e.target.value)
                        if (t) {
                          if (t.symbol === tokenIn.symbol) setTokenIn(tokenOut)
                          setTokenOut(t)
                        }
                      }}
                    >
                      {tokenList.map((t) => (
                        <MenuItem key={t.symbol} value={t.symbol}>
                          {t.symbol}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                </Paper>

                <Box display="flex" justifyContent="space-between" alignItems="center" mt={2} mb={1}>
                  <Typography variant="caption" color="text.secondary">
                    Slippage Tolerance
                  </Typography>
                  <Box display="flex" gap={0.5}>
                    {['0.5', '1.0', '2.0'].map((val) => (
                      <Chip
                        key={val}
                        label={`${val}%`}
                        size="small"
                        color={slippage === val ? 'primary' : 'default'}
                        onClick={() => setSlippage(val)}
                        clickable
                      />
                    ))}
                  </Box>
                </Box>

                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={handleTrade}
                  disabled={isTrading || selectedClients.length === 0 || !amountIn}
                  startIcon={isTrading ? <CircularProgress size={20} color="inherit" /> : <TrendingUpIcon />}
                  sx={{ mt: 2 }}
                >
                  {isTrading ? 'Executing...' : selectedClients.length === 0 ? 'Select Client(s)' : 'Swap'}
                </Button>
              </Grid>

              {/* Daily Limit (Right side of Swap) */}
              <Grid item xs={12} md={5}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%', bgcolor: 'transparent' }}>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <SettingsIcon fontSize="small" />
                    <Typography variant="subtitle2" fontWeight={600}>
                      Daily Limit Config
                    </Typography>
                  </Box>
                  {selectedClients.length !== 1 && (
                    <Alert severity="warning" sx={{ mb: 2, fontSize: '0.8rem' }}>
                      Select exactly 1 client
                    </Alert>
                  )}
                  <TextField
                    fullWidth
                    size="small"
                    label="Daily Limit (USD)"
                    value={newDailyLimit}
                    onChange={(e) => setNewDailyLimit(e.target.value)}
                    type="number"
                    disabled={selectedClients.length !== 1}
                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                    sx={{ mb: 2 }}
                  />
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={handleSetLimit}
                    disabled={isTrading || selectedClients.length !== 1 || !newDailyLimit}
                  >
                    Set Limit
                  </Button>
                </Paper>
              </Grid>
            </Grid>
          </Paper>

          <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.1)' }} />

          {/* 2. Orders Section */}
          <Paper sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight={600}>
                Conditional Orders
              </Typography>
              {isMonitoring && (
                <Chip
                  label="Monitoring Active"
                  color="success"
                  size="small"
                  icon={<CircularProgress size={10} color="inherit" />}
                />
              )}
            </Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              <strong>Keep this tab open.</strong> These orders are monitored and executed client-side. Closing the tab
              will pause execution.
            </Alert>

            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" mb={1} color="text.secondary">
                  Order Type
                </Typography>
                <Box display="flex" flexDirection="column" gap={1}>
                  {orderTypes.map((order) => (
                    <Card
                      key={order.id}
                      variant="outlined"
                      onClick={() => setSelectedOrderType(order.id)}
                      sx={{
                        cursor: 'pointer',
                        borderColor: selectedOrderType === order.id ? 'primary.main' : 'divider',
                        bgcolor: selectedOrderType === order.id ? 'action.selected' : 'transparent',
                      }}
                    >
                      <CardContent
                        sx={{ p: 1.5, pb: '12px !important', display: 'flex', alignItems: 'center', gap: 2 }}
                      >
                        {order.icon}
                        <Box>
                          <Typography variant="subtitle2">{order.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {order.description}
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              </Grid>

              <Grid item xs={12} md={8}>
                <Typography variant="subtitle2" mb={1} color="text.secondary">
                  Configuration ({selectedOrder?.fullName})
                </Typography>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                  <Grid container spacing={2}>
                    {/* Token Pair */}
                    <Grid item xs={6} sm={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Sell Token</InputLabel>
                        <Select
                          value={orderTokenIn}
                          label="Sell Token"
                          onChange={(e) => setOrderTokenIn(e.target.value)}
                        >
                          {tokenSymbols.map((s) => (
                            <MenuItem key={s} value={s}>
                              {s}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Buy Token</InputLabel>
                        <Select
                          value={orderTokenOut}
                          label="Buy Token"
                          onChange={(e) => setOrderTokenOut(e.target.value)}
                        >
                          {tokenSymbols
                            .filter((s) => s !== orderTokenIn)
                            .map((s) => (
                              <MenuItem key={s} value={s}>
                                {s}
                              </MenuItem>
                            ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    {/* Amount & Trigger */}
                    <Grid item xs={6} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label={`Amount (${orderTokenIn})`}
                        type="number"
                        value={orderAmountIn}
                        onChange={(e) => setOrderAmountIn(e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Trigger Price"
                        type="number"
                        value={orderTriggerPrice}
                        onChange={(e) => setOrderTriggerPrice(e.target.value)}
                        InputProps={{ endAdornment: <InputAdornment position="end">{orderTokenOut}</InputAdornment> }}
                      />
                    </Grid>

                    {selectedOrderType === 'stop-limit' && (
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Limit Price (Min Receive)"
                          type="number"
                          value={orderLimitPrice}
                          onChange={(e) => setOrderLimitPrice(e.target.value)}
                        />
                      </Grid>
                    )}

                    {selectedOrderType !== 'limit' && (
                      <Grid item xs={12}>
                        <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                          Trigger Condition
                        </Typography>
                        <Box display="flex" gap={1}>
                          <Button
                            size="small"
                            variant={triggerCondition === 'below' ? 'contained' : 'outlined'}
                            color="error"
                            onClick={() => setTriggerCondition('below')}
                            startIcon={<TrendingDownIcon />}
                          >
                            Falls Below
                          </Button>
                          <Button
                            size="small"
                            variant={triggerCondition === 'above' ? 'contained' : 'outlined'}
                            color="success"
                            onClick={() => setTriggerCondition('above')}
                            startIcon={<TrendingUpIcon />}
                          >
                            Rises Above
                          </Button>
                        </Box>
                      </Grid>
                    )}

                    <Grid item xs={12}>
                      <Button
                        variant="contained"
                        fullWidth
                        startIcon={<PlayArrowIcon />}
                        onClick={handleCreateOrder}
                        disabled={selectedClients.length === 0}
                      >
                        Create Order {selectedClients.length > 1 && `(${selectedClients.length} clients)`}
                      </Button>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            </Grid>

            {/* Orders Table */}
            <Box mt={3}>
              <Tabs
                value={ordersTabValue}
                onChange={(_, v) => setOrdersTabValue(v)}
                sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
              >
                <Tab label={`Pending (${pendingOrders.length})`} />
                <Tab label={`Filled (${filledOrders.length})`} />
                <Tab label={`Failed (${failedOrders.length})`} />
              </Tabs>
              <TableContainer sx={{ maxHeight: 300 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Pair</TableCell>
                      <TableCell>Amt</TableCell>
                      <TableCell>Trigger</TableCell>
                      <TableCell>Clients</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(ordersTabValue === 0 ? pendingOrders : ordersTabValue === 1 ? filledOrders : failedOrders).map(
                      (o) => (
                        <TableRow key={o.id}>
                          <TableCell>{o.type}</TableCell>
                          <TableCell>
                            {o.tokenIn}/{o.tokenOut}
                          </TableCell>
                          <TableCell>{o.amountIn}</TableCell>
                          <TableCell>
                            {parseFloat(o.triggerPrice).toFixed(4)}
                            {o.triggerCondition === 'above' ? ' (≥)' : ' (≤)'}
                          </TableCell>
                          <TableCell>{o.clientAddresses.length}</TableCell>
                          <TableCell>
                            <Chip label={o.status} size="small" color={o.status === 'filled' ? 'success' : 'default'} />
                          </TableCell>
                          <TableCell>
                            {o.status === 'pending' && (
                              <IconButton size="small" color="error" onClick={() => handleDeleteOrder(o.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            )}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                    {(ordersTabValue === 0 ? pendingOrders : ordersTabValue === 1 ? filledOrders : failedOrders)
                      .length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center">
                          No orders
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
