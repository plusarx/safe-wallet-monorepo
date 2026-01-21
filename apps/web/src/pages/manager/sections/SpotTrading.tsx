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
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import GroupIcon from '@mui/icons-material/Group'
import RefreshIcon from '@mui/icons-material/Refresh'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import BarChartIcon from '@mui/icons-material/BarChart'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import GpsFixedIcon from '@mui/icons-material/GpsFixed'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FlashOnIcon from '@mui/icons-material/FlashOn'

import { useTradingModule } from '../../../hooks/useTradingModule'
import { TOKENS, FEE_TIERS, TOKENS_BY_CHAIN } from '../../../contracts/TradingModule'
import useWallet from '@/hooks/wallets/useWallet'
import { useManagerClients } from '@/hooks/manager/useManagerClients'

// --- Types & Constants ---

const DEFAULT_TOKEN_LIST = [
  { symbol: 'WETH', address: TOKENS.WETH.address, decimals: 18 },
  { symbol: 'USDC', address: TOKENS.USDC.address, decimals: 6 },
]

type OrderType = 'market' | 'limit' | 'stop-market' | 'stop-limit'

interface TriggerOrder {
  id: string
  type: Exclude<OrderType, 'market'>
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

  // Trading Module
  const {
    isLoading: isTrading,
    error: tradeError,
    executeTrade,
    executeBatchTrade,
    calculateFee,
    getQuote,
  } = useTradingModule()

  // --- Unified Form State ---
  const [orderType, setOrderType] = useState<OrderType>('market')

  const [tokenList, setTokenList] = useState(DEFAULT_TOKEN_LIST)
  // Store symbols (string) to easily handle dynamic lists, find object when needed
  const [tokenInSymbol, setTokenInSymbol] = useState(DEFAULT_TOKEN_LIST[0].symbol)
  const [tokenOutSymbol, setTokenOutSymbol] = useState(DEFAULT_TOKEN_LIST[1].symbol)

  const [amountIn, setAmountIn] = useState('')

  // Market specific
  const [slippage, setSlippage] = useState('0.5')
  const [quoteAmountOut, setQuoteAmountOut] = useState('')
  const [isQuoting, setIsQuoting] = useState(false)
  const [_estimatedFee, setEstimatedFee] = useState<string>('0')

  // Limit/Stop specific
  const [triggerPrice, setTriggerPrice] = useState('')
  const [limitPrice, setLimitPrice] = useState('') // For Stop-Limit
  const [triggerCondition, setTriggerCondition] = useState<'above' | 'below'>('below')

  // --- Orders Management State ---
  const [orders, setOrders] = useState<TriggerOrder[]>([])
  const [ordersTabValue, setOrdersTabValue] = useState(0)
  const [isMonitoring, setIsMonitoring] = useState(false)

  const [chainId, setChainId] = useState(42161) // Default Arb One
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Helper to get full token objects
  const tokenIn = tokenList.find((t) => t.symbol === tokenInSymbol) || tokenList[0]
  const tokenOut = tokenList.find((t) => t.symbol === tokenOutSymbol) || tokenList[1]

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
          if (!list.find((t) => t.symbol === tokenInSymbol)) {
            setTokenInSymbol(list[0]?.symbol || 'WETH')
            setTokenOutSymbol(list[1]?.symbol || list[0]?.symbol || 'USDC')
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadChainData()
  }, [tokenInSymbol])

  // Calculate fee & Quote (ONLY for Market Swap or estimating price)
  useEffect(() => {
    if (orderType === 'market' && amountIn && parseFloat(amountIn) > 0) {
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
  }, [amountIn, tokenIn, tokenOut, calculateFee, getQuote, orderType])

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

  // Save Orders
  useEffect(() => {
    if (orders.length > 0) localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
  }, [orders])

  // Monitoring Logic for Orders (Client-Side)
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

            // Calculate Min Output based on order type
            let minAmountOut: string
            if (order.type === 'stop-market') {
              const expectedOutput = parseFloat(order.amountIn) * currentPriceNum
              minAmountOut = (expectedOutput * 0.99).toFixed(tokenOutData.decimals) // 1% Slippage
            } else if (order.type === 'stop-limit' && order.limitPrice) {
              const expectedOutput = parseFloat(order.amountIn) * parseFloat(order.limitPrice)
              minAmountOut = expectedOutput.toFixed(tokenOutData.decimals)
            } else {
              // Limit Order
              const expectedOutput = parseFloat(order.amountIn) * triggerPriceNum
              minAmountOut = (expectedOutput * 0.99).toFixed(tokenOutData.decimals)
            }

            try {
              // Execute
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
    const temp = tokenInSymbol
    setTokenInSymbol(tokenOutSymbol)
    setTokenOutSymbol(temp)
    setQuoteAmountOut('')
  }

  const handleSubmit = async () => {
    if (selectedClients.length === 0 || !amountIn) {
      setMessage({ type: 'error', text: 'Select clients and enter amount' })
      return
    }
    setMessage(null)

    if (orderType === 'market') {
      // --- Market Swap Execution ---
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
    } else {
      // --- Create Conditional Order ---
      if (!triggerPrice) {
        setMessage({ type: 'error', text: 'Trigger price is required' })
        return
      }
      if (orderType === 'stop-limit' && !limitPrice) {
        setMessage({ type: 'error', text: 'Limit price is required for Stop-Limit orders' })
        return
      }

      const newOrder: TriggerOrder = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: orderType as Exclude<OrderType, 'market'>,
        clientAddresses: selectedClients.map((c) => c.address),
        tokenIn: tokenInSymbol,
        tokenOut: tokenOutSymbol,
        amountIn,
        triggerPrice,
        limitPrice: orderType === 'stop-limit' ? limitPrice : undefined,
        triggerCondition,
        status: 'pending',
        createdAt: new Date(),
      }

      setOrders((prev) => [...prev, newOrder])
      setMessage({ type: 'success', text: `Order created for ${selectedClients.length} client(s)!` })
      setAmountIn('')
    }
  }

  // --- Render Helpers ---

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
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
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

                <Box sx={{ flex: 1, overflow: 'auto', minHeight: 300 }}>
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

        {/* --- Right Column: Unified Order Entry --- */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 4 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography variant="h6" fontWeight={600}>
                Order Entry
              </Typography>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <Select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
                  <MenuItem value="market">
                    <Box display="flex" alignItems="center" gap={1}>
                      <FlashOnIcon fontSize="small" /> Market Swap
                    </Box>
                  </MenuItem>
                  <MenuItem value="limit">
                    <Box display="flex" alignItems="center" gap={1}>
                      <BarChartIcon fontSize="small" />
                      Trigger Market
                    </Box>
                  </MenuItem>
                  <MenuItem value="stop-market">
                    <Box display="flex" alignItems="center" gap={1}>
                      <NotificationsActiveIcon fontSize="small" /> Stop-Loss Market
                    </Box>
                  </MenuItem>
                  <MenuItem value="stop-limit">
                    <Box display="flex" alignItems="center" gap={1}>
                      <GpsFixedIcon fontSize="small" /> Stop-Loss Limit
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Unified Form Inputs */}
            <Grid container spacing={3}>
              {/* Row 1: Token Selection */}
              <Grid item xs={5}>
                <TextField
                  select
                  fullWidth
                  label="Sell"
                  value={tokenInSymbol}
                  onChange={(e) => {
                    const symbol = e.target.value
                    if (symbol === tokenOutSymbol) setTokenOutSymbol(tokenInSymbol)
                    setTokenInSymbol(symbol)
                  }}
                >
                  {tokenList.map((t) => (
                    <MenuItem key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={2} display="flex" alignItems="center" justifyContent="center">
                <IconButton onClick={handleSwapTokens} color="primary">
                  <SwapVertIcon />
                </IconButton>
              </Grid>
              <Grid item xs={5}>
                <TextField
                  select
                  fullWidth
                  label="Buy"
                  value={tokenOutSymbol}
                  onChange={(e) => {
                    const symbol = e.target.value
                    if (symbol === tokenInSymbol) setTokenInSymbol(tokenOutSymbol)
                    setTokenOutSymbol(symbol)
                  }}
                >
                  {tokenList.map((t) => (
                    <MenuItem key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Row 2: Amount & Estimation */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={`Amount (${tokenInSymbol})`}
                  type="number"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  InputProps={{
                    endAdornment: orderType === 'market' && isQuoting ? <CircularProgress size={20} /> : null,
                  }}
                />
                {orderType === 'market' && quoteAmountOut && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Estimated Receive: ~{parseFloat(quoteAmountOut).toFixed(6)} {tokenOutSymbol}
                  </Typography>
                )}
              </Grid>

              {/* Row 3: Conditional Fields based on Order Type */}
              {orderType !== 'market' && (
                <>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Trigger Price"
                      type="number"
                      value={triggerPrice}
                      onChange={(e) => setTriggerPrice(e.target.value)}
                      helperText={`1 ${tokenInSymbol} = X ${tokenOutSymbol}`}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <IconButton
                              size="small"
                              onClick={() => setTriggerCondition((prev) => (prev === 'above' ? 'below' : 'above'))}
                            >
                              {triggerCondition === 'above' ? (
                                <TrendingUpIcon color="success" />
                              ) : (
                                <TrendingDownIcon color="error" />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                  {orderType === 'stop-limit' && (
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="Limit Price (Min Receive)"
                        type="number"
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(e.target.value)}
                      />
                    </Grid>
                  )}
                </>
              )}

              {/* Row 4: Slippage (Market Only) */}
              {orderType === 'market' && (
                <Grid item xs={12}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Typography variant="body2">Slippage:</Typography>
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
                </Grid>
              )}

              {/* Order Preview */}
              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={6} md={3}>
                      <Typography variant="caption" color="text.secondary">
                        Pay
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {amountIn || '0'} {tokenInSymbol}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} md={3}>
                      <Typography variant="caption" color="text.secondary">
                        Receive {orderType === 'market' ? '(Est.)' : '(Min)'}
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {orderType === 'market'
                          ? quoteAmountOut
                            ? parseFloat(quoteAmountOut).toFixed(6)
                            : '0'
                          : (orderType === 'limit' || orderType === 'stop-market') && triggerPrice && amountIn
                            ? (parseFloat(amountIn) * parseFloat(triggerPrice)).toFixed(6)
                            : orderType === 'stop-limit' && limitPrice && amountIn
                              ? (parseFloat(amountIn) * parseFloat(limitPrice)).toFixed(6)
                              : '-'}{' '}
                        {tokenOutSymbol}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} md={3}>
                      <Typography variant="caption" color="text.secondary">
                        Price
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {orderType === 'market' && quoteAmountOut && amountIn
                          ? `1 ${tokenInSymbol} ≈ ${(parseFloat(quoteAmountOut) / parseFloat(amountIn)).toFixed(4)} ${tokenOutSymbol}`
                          : triggerPrice
                            ? `1 ${tokenInSymbol} = ${triggerPrice} ${tokenOutSymbol}`
                            : '-'}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} md={3}>
                      <Typography variant="caption" color="text.secondary">
                        Slippage / Router
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {orderType === 'market' ? `${slippage}%` : 'N/A'} • Uniswap V3
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>

              {/* Action Button */}
              <Grid item xs={12}>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={handleSubmit}
                  disabled={isTrading || selectedClients.length === 0 || !amountIn}
                  startIcon={isTrading ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                >
                  {isTrading ? 'Executing...' : orderType === 'market' ? 'Execute Swap' : 'Create Order'}
                </Button>
                {selectedClients.length > 1 && (
                  <Typography variant="caption" align="center" display="block" sx={{ mt: 1, color: 'primary.main' }}>
                    Executing for {selectedClients.length} selected clients
                  </Typography>
                )}
              </Grid>
            </Grid>
          </Paper>

          <Divider sx={{ my: 4, borderColor: 'divider' }} />

          {/* Conditional Orders Table */}
          {/* {orders.length > 0 && ( */}
          <Paper sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight={600}>
                Orders
              </Typography>
              {isMonitoring && (
                <Chip
                  label="Monitoring"
                  color="success"
                  size="small"
                  icon={<CircularProgress size={10} color="inherit" />}
                />
              )}
            </Box>
            <Tabs
              value={ordersTabValue}
              onChange={(_, v) => setOrdersTabValue(v)}
              sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label={`Pending (${pendingOrders.length})`} />
              <Tab label={`Filled (${filledOrders.length})`} />
              <Tab label={`History (${failedOrders.length})`} />
            </Tabs>
            <TableContainer sx={{ maxHeight: 300 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Pair</TableCell>
                    <TableCell>Amt</TableCell>
                    <TableCell>Trigger</TableCell>
                    <TableCell>Status</TableCell>
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
                        <TableCell>
                          <Chip label={o.status} size="small" color={o.status === 'filled' ? 'success' : 'default'} />
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
          {/* )} */}
        </Grid>
      </Grid>
    </Box>
  )
}
