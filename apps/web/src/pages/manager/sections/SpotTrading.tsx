'use client'

import { useState, useEffect } from 'react'
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
  IconButton,
  Chip,
  Checkbox,
  FormControlLabel,
  Divider,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import GroupIcon from '@mui/icons-material/Group'
import RefreshIcon from '@mui/icons-material/Refresh'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FlashOnIcon from '@mui/icons-material/FlashOn'
import SwapHoriz from '@mui/icons-material/SwapHoriz'
import ScheduleIcon from '@mui/icons-material/Schedule'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import DeleteIcon from '@mui/icons-material/Delete'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import PeopleIcon from '@mui/icons-material/People'
import DownloadIcon from '@mui/icons-material/Download'
import { Tabs, Tab } from '@mui/material'

import type { OrderType as EngineOrderType } from '../../../hooks/useOrderEngine'
import { useOrderEngine } from '../../../hooks/useOrderEngine'
import { useTradingModule } from '../../../hooks/useTradingModule'
import { TOKENS, FEE_TIERS, TOKENS_BY_CHAIN } from '../../../contracts/TradingModule'
import type { ClientInfo } from '../../../hooks/manager/useManagerClients'
import TradingViewChart from '../../../components/trading/TradingViewChart'

// --- Types ---

export type OrderType = 'market' | 'twap' | 'smart_market' | 'smart_twap'

// Timezone Options
const TIMEZONES = ['UTC', 'GMT', 'EST', 'CST', 'MST', 'PST', 'IST', 'CET', 'JST', 'AEST']

interface SpotTradingProps {
  clients: ClientInfo[]
  isLoadingClients: boolean
  toggleClient: (address: string) => void
  toggleSelectAll: (filteredClients: ClientInfo[]) => void
  refreshClients: () => void
  selectedClients: ClientInfo[]
}

interface TriggerOrder {
  id: string
  type: string
  clientAddresses: string[]
  tokenIn: string
  tokenOut: string
  amountIn: string
  triggerPrice?: string
  limitPrice?: string
  chunks?: string
  slices?: string
  duration?: string
  triggerCondition?: 'above' | 'below'
  timeTrigger?: string
  timezone?: string
  triggerOperator?: 'AND' | 'OR'
  status: 'pending' | 'triggered' | 'filled' | 'cancelled' | 'failed' | 'partial'
  createdAt: string
  triggeredAt?: string
  filledAt?: string
}

const DEFAULT_TOKEN_LIST = [
  { symbol: 'WETH', address: TOKENS.WETH.address, decimals: 18 },
  { symbol: 'USDC', address: TOKENS.USDC.address, decimals: 6 },
]

const ORDERS_KEY = 'trading_trigger_orders'

export default function SpotTrading({
  clients,
  isLoadingClients,
  toggleClient,
  toggleSelectAll,
  refreshClients,
  selectedClients,
}: SpotTradingProps) {
  // --- Layout State ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  // --- Client Sidebar State ---
  const [walletTypeFilter, setWalletTypeFilter] = useState<'all' | 'eoa' | 'safe'>('all')

  // --- Trading Form State ---
  const { getQuote } = useTradingModule()
  const {
    isExecuting: isTrading,
    currentOrder,
    error: tradeError,
    executeOrder,
    cancelOrder,
    getOrderHistory,
    downloadAnalyticsCSV,
  } = useOrderEngine()

  const [orderType, setOrderType] = useState<OrderType>('market')
  const [tokenList, setTokenList] = useState(DEFAULT_TOKEN_LIST)
  const [tokenInSymbol, setTokenInSymbol] = useState(DEFAULT_TOKEN_LIST[0].symbol)
  const [tokenOutSymbol, setTokenOutSymbol] = useState(DEFAULT_TOKEN_LIST[1].symbol)
  const [amountIn, setAmountIn] = useState('')
  const [slippage, setSlippage] = useState('1.0') // Default 1%

  // Advanced Params
  const [chunks, setChunks] = useState('5') // Default 5
  const [slices, setSlices] = useState('2') // Default 2
  const [duration, setDuration] = useState('')

  // Triggers
  const [priceTriggerType, setPriceTriggerType] = useState<'none' | '>=' | '<='>('none')
  const [priceTriggerValue, setPriceTriggerValue] = useState('')
  const [timeTriggerType, setTimeTriggerType] = useState<'none' | 'at'>('none')
  const [timeTriggerValue, setTimeTriggerValue] = useState('')
  const [timezone, setTimezone] = useState('UTC') // Default UTC
  const [triggerOperator, setTriggerOperator] = useState<'AND' | 'OR'>('OR') // Default OR

  // Quote / Estimation
  const [quoteAmountOut, setQuoteAmountOut] = useState('')
  const [spotRate, setSpotRate] = useState('') // Rate for 1 unit (for price impact calculation)
  const [isQuoting, setIsQuoting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // --- Orders State ---
  const [orders, setOrders] = useState<TriggerOrder[]>([])
  const [executedOrders, setExecutedOrders] = useState<any[]>([])
  const [tabValue, setTabValue] = useState(0)

  // Derived Lists - Merge trigger orders with executed orders from engine
  const pendingOrders = orders.filter((o) => ['pending', 'triggered'].includes(o.status))

  // Convert executed orders to display format and merge with filled trigger orders
  const executedFilledOrders: TriggerOrder[] = executedOrders
    .filter((o) => o.status === 'filled')
    .map((o) => ({
      id: o.id,
      type: o.params?.orderType || 'market',
      clientAddresses: o.params?.clientAddresses || [],
      tokenIn: o.params?.tokenIn?.symbol || '',
      tokenOut: o.params?.tokenOut?.symbol || '',
      amountIn: o.params?.totalAmount || o.executedVolume || '0',
      status: o.status as 'filled',
      createdAt:
        typeof o.createdAt === 'string' ? o.createdAt : o.createdAt?.toISOString?.() || new Date().toISOString(),
      // Optional trigger properties (not applicable for immediate orders)
      triggerPrice: undefined,
      triggerCondition: undefined,
      timeTrigger: undefined,
      timezone: undefined,
      triggerOperator: undefined,
      chunks: o.params?.chunks,
      slices: o.params?.slices,
      duration: o.params?.durationMinutes,
      limitPrice: undefined,
    }))
  const filledOrders = [...orders.filter((o) => o.status === 'filled'), ...executedFilledOrders]

  // Same for failed orders
  const executedFailedOrders: TriggerOrder[] = executedOrders
    .filter((o) => ['cancelled', 'failed'].includes(o.status))
    .map((o) => ({
      id: o.id,
      type: o.params?.orderType || 'market',
      clientAddresses: o.params?.clientAddresses || [],
      tokenIn: o.params?.tokenIn?.symbol || '',
      tokenOut: o.params?.tokenOut?.symbol || '',
      amountIn: o.params?.totalAmount || '0',
      status: o.status as 'failed' | 'cancelled',
      createdAt:
        typeof o.createdAt === 'string' ? o.createdAt : o.createdAt?.toISOString?.() || new Date().toISOString(),
      // Optional trigger properties (not applicable for immediate orders)
      triggerPrice: undefined,
      triggerCondition: undefined,
      timeTrigger: undefined,
      timezone: undefined,
      triggerOperator: undefined,
      chunks: o.params?.chunks,
      slices: o.params?.slices,
      duration: o.params?.durationMinutes,
      limitPrice: undefined,
    }))
  const failedOrders = [...orders.filter((o) => ['cancelled', 'failed'].includes(o.status)), ...executedFailedOrders]

  // Helpers
  const shortenAddress = (addr: string) => `${addr.substring(0, 5)}...${addr.substring(addr.length - 4)}`

  const getOrderTypeLabel = (type: string) => {
    switch (type) {
      case 'market':
        return 'Market'
      case 'twap':
        return 'TWAP'
      case 'smart_market':
        return 'Smart Market'
      case 'smart_twap':
        return 'Smart TWAP'
      default:
        return type.replace(/_/g, ' ').toUpperCase()
    }
  }

  // Derived Values
  const tokenIn = tokenList.find((t) => t.symbol === tokenInSymbol) || tokenList[0]
  const tokenOut = tokenList.find((t) => t.symbol === tokenOutSymbol) || tokenList[1]

  const filteredClients = clients.filter((c) => walletTypeFilter === 'all' || c.walletType === walletTypeFilter)
  const selectedCount = selectedClients.length

  // Calculate price impact: compares execution rate vs spot rate
  // Positive = paying more than spot (worse), Negative = paying less (better)
  const priceImpact = (() => {
    if (!quoteAmountOut || !spotRate || !amountIn || parseFloat(amountIn) <= 0) return null
    const executionRate = parseFloat(quoteAmountOut) / parseFloat(amountIn) // tokenOut per tokenIn
    const spotRateNum = parseFloat(spotRate) // tokenOut per 1 tokenIn
    if (spotRateNum === 0) return null
    // Price impact = ((spotRate - executionRate) / spotRate) * 100
    // Positive means you get less than spot rate (slippage/impact)
    return ((spotRateNum - executionRate) / spotRateNum) * 100
  })()

  // --- Effects ---

  // Load Tokens and Orders
  useEffect(() => {
    // Trigger Orders
    const saved = localStorage.getItem(ORDERS_KEY)
    if (saved) {
      try {
        setOrders(JSON.parse(saved).reverse())
      } catch (e) {
        console.error(e)
      }
    }

    // Executed Orders from Order Engine
    const history = getOrderHistory()
    setExecutedOrders(history)

    // Tokens (Mock / Chain load)
    const cId = 42161
    const tokens = TOKENS_BY_CHAIN[cId]
    if (tokens) {
      setTokenList(Object.values(tokens))
    }
  }, [getOrderHistory])

  // Quote Logic
  useEffect(() => {
    if (amountIn && parseFloat(amountIn) > 0) {
      setIsQuoting(true)
      const delay = setTimeout(() => {
        // Fetch both the actual quote and spot rate (1 unit) in parallel
        Promise.all([
          getQuote(tokenIn.address, tokenOut.address, amountIn, FEE_TIERS.LOW, tokenIn.decimals, tokenOut.decimals),
          getQuote(tokenIn.address, tokenOut.address, '1', FEE_TIERS.LOW, tokenIn.decimals, tokenOut.decimals),
        ])
          .then(([amount, spot]) => {
            setQuoteAmountOut(amount)
            setSpotRate(spot)
            setIsQuoting(false)
          })
          .catch(() => setIsQuoting(false))
      }, 500)
      return () => clearTimeout(delay)
    } else {
      setQuoteAmountOut('')
      setSpotRate('')
      setIsQuoting(false)
    }
  }, [amountIn, tokenIn, tokenOut, getQuote])

  // --- Order Monitor (Triggers) ---
  useEffect(() => {
    const checkTriggers = async () => {
      // Avoid running if already executing a trade (simple lock)
      if (isTrading) return

      const now = new Date()
      let updatedOrders = [...orders]
      let hasUpdates = false

      for (let i = 0; i < updatedOrders.length; i++) {
        const order = updatedOrders[i]

        // Only check pending orders
        if (order.status !== 'pending') continue

        let shouldExecute = false

        // 1. Time Trigger
        if (order.timeTrigger && order.timeTrigger !== 'undefined') {
          const triggerTime = new Date(order.timeTrigger)
          if (now >= triggerTime) {
            shouldExecute = true
          }
        }

        // 2. Price Trigger (Simple polling)
        if (!shouldExecute && order.triggerPrice && order.triggerPrice !== 'undefined' && order.triggerCondition) {
          try {
            // Get spot price (1 unit)
            const tIn = tokenList.find(t => t.symbol === order.tokenIn)
            const tOut = tokenList.find(t => t.symbol === order.tokenOut)
            if (tIn && tOut) {
              const spotQuote = await getQuote(tIn.address, tOut.address, '1', FEE_TIERS.LOW, tIn.decimals, tOut.decimals)
              if (spotQuote && spotQuote !== '0') {
                const quoteVal = parseFloat(spotQuote)
                const inverseVal = 1 / quoteVal
                const triggerVal = parseFloat(order.triggerPrice)

                // Heuristic: Check which price (direct or inverse) matches the user's trigger magnitude
                const diff1 = Math.abs(Math.log(quoteVal / triggerVal))
                const diff2 = Math.abs(Math.log(inverseVal / triggerVal))

                const actualPrice = diff1 < diff2 ? quoteVal : inverseVal
                console.log(`[OrderMonitor] Check ${order.id}: Quote=${quoteVal}, Inverse=${inverseVal}, Trigger=${triggerVal}, Match=${actualPrice}`)

                if (order.triggerCondition === 'above' && actualPrice >= triggerVal) shouldExecute = true
                if (order.triggerCondition === 'below' && actualPrice <= triggerVal) shouldExecute = true
              }
            }
          } catch (e) { console.error('Trigger price check failed', e) }
        }

        if (shouldExecute) {
          console.log(`[OrderMonitor] Executing trigger order ${order.id}`)
          hasUpdates = true
          updatedOrders[i] = { ...order, status: 'triggered', triggeredAt: new Date().toISOString() }

          // Execute!
          try {
            const tIn = tokenList.find(t => t.symbol === order.tokenIn)
            const tOut = tokenList.find(t => t.symbol === order.tokenOut)

            if (!tIn || !tOut) throw new Error('Tokens not found')

            // Map clients
            // We need to find client infos based on addresses
            // Use 'clients' prop if available or construct minimal info
            const orderClients = clients.filter(c => order.clientAddresses.includes(c.address))
            if (orderClients.length === 0) throw new Error('Clients not found')

            await executeOrder({
              orderType: (order.type as EngineOrderType) || 'market',
              clientAddresses: order.clientAddresses,
              tokenIn: { address: tIn.address, symbol: tIn.symbol, decimals: tIn.decimals },
              tokenOut: { address: tOut.address, symbol: tOut.symbol, decimals: tOut.decimals },
              totalAmount: order.amountIn,
              slippage: 1.0, // Default for triggers
              slices: order.slices ? parseInt(order.slices) : undefined,
              durationMinutes: order.duration ? parseInt(order.duration) : undefined,
              chunks: order.chunks ? parseInt(order.chunks) : undefined,
            })

            updatedOrders[i] = { ...updatedOrders[i], status: 'filled', filledAt: new Date().toISOString() }
            setMessage({ type: 'success', text: `Trigger Order ${order.id} executed!` })
          } catch (err: any) {
            console.error('Trigger execution failed', err)
            updatedOrders[i] = { ...updatedOrders[i], status: 'failed' }
            setMessage({ type: 'error', text: `Trigger Order ${order.id} failed: ${err.message}` })
          }
        }
      }

      if (hasUpdates) {
        setOrders(updatedOrders)
        localStorage.setItem(ORDERS_KEY, JSON.stringify(updatedOrders.reverse()))
        // Refresh history
        const history = getOrderHistory()
        setExecutedOrders(history)
      }
    }

    const intervalId = setInterval(checkTriggers, 3000) // Check every 3 seconds
    return () => clearInterval(intervalId)
  }, [orders, isTrading, executeOrder, getQuote, tokenList, clients, getOrderHistory])

  // --- Handlers ---

  const handleSwapTokens = () => {
    const temp = tokenInSymbol
    setTokenInSymbol(tokenOutSymbol)
    setTokenOutSymbol(temp)
    setQuoteAmountOut('')
    setSpotRate('')
  }

  const handleDeleteOrder = (id: string) => {
    const newOrders = orders.filter((o) => o.id !== id)
    setOrders(newOrders)
    localStorage.setItem(ORDERS_KEY, JSON.stringify(newOrders.reverse())) // Store in original order logic if needed, simplify here
  }

  const handleSubmit = async () => {
    if (selectedClients.length === 0) {
      setMessage({ type: 'error', text: 'No clients selected' })
      return
    }

    // Has price/time triggers? Save as pending order for monitoring
    if (priceTriggerType !== 'none' || timeTriggerType !== 'none') {
      const newOrder: TriggerOrder = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: orderType,
        clientAddresses: selectedClients.map((c) => c.address),
        tokenIn: tokenInSymbol,
        tokenOut: tokenOutSymbol,
        amountIn,
        triggerPrice: priceTriggerType !== 'none' ? priceTriggerValue : undefined,
        triggerCondition: priceTriggerType === 'none' ? undefined : priceTriggerType === '>=' ? 'above' : 'below',
        timeTrigger: timeTriggerType !== 'none' ? timeTriggerValue : undefined,
        timezone: timeTriggerType !== 'none' ? timezone : undefined,
        triggerOperator: priceTriggerType !== 'none' && timeTriggerType !== 'none' ? triggerOperator : undefined,
        chunks: orderType === 'smart_market' || orderType === 'smart_twap' ? chunks : undefined,
        slices: orderType === 'twap' || orderType === 'smart_twap' ? slices : undefined,
        duration: orderType === 'twap' || orderType === 'smart_twap' ? duration : undefined,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      const updated = [newOrder, ...orders]
      setOrders(updated)
      localStorage.setItem(ORDERS_KEY, JSON.stringify(updated.slice().reverse()))
      setMessage({ type: 'success', text: 'Trigger Order Created!' })
      setAmountIn('')
      setChunks('')
      setSlices('')
      setDuration('')
      return
    }

    // Immediate execution via Order Engine
    try {
      await executeOrder({
        orderType: orderType as EngineOrderType,
        clientAddresses: selectedClients.map((c) => c.address),
        tokenIn,
        tokenOut,
        totalAmount: amountIn,
        slippage: parseFloat(slippage),
        slices: slices ? parseInt(slices, 10) : undefined,
        durationMinutes: duration ? parseInt(duration, 10) : undefined,
        chunks: chunks ? parseInt(chunks, 10) : undefined,
      })

      const orderLabel =
        orderType === 'market'
          ? 'Market'
          : orderType === 'twap'
            ? 'TWAP'
            : orderType === 'smart_market'
              ? 'Smart Market'
              : 'Smart TWAP'
      setMessage({ type: 'success', text: `${orderLabel} Order Executed!` })

      // Refresh executed orders to update history table
      const updatedHistory = getOrderHistory()
      setExecutedOrders(updatedHistory)

      setAmountIn('')
      setChunks('')
      setSlices('')
      setDuration('')
    } catch (e: any) {
      console.error(e)
      setMessage({ type: 'error', text: e.message || 'Order Execution Failed' })
    }
  }

  // --- Render ---

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 
          TOP ROW: Sidebar + Form 
          They should match height. We use Flex Row.
      */}
      <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
        {/* === Sidebar === */}
        <Paper
          elevation={2}
          sx={{
            width: isSidebarOpen ? 280 : 56,
            transition: 'width 0.3s',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: isSidebarOpen ? 'space-between' : 'center',
              borderBottom: 1,
              borderColor: 'divider',
              height: 64, // Fixed Header Height
            }}
          >
            {isSidebarOpen ? (
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>
                  Clients
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedCount} Selected
                </Typography>
              </Box>
            ) : (
              <Tooltip title={`${selectedCount} Selected`}>
                <GroupIcon color={selectedCount > 0 ? 'primary' : 'action'} />
              </Tooltip>
            )}
            <IconButton onClick={() => setIsSidebarOpen(!isSidebarOpen)} size="small">
              {isSidebarOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
            </IconButton>
          </Box>

          {/* Expanded List */}
          {isSidebarOpen && (
            <Box sx={{ p: 2, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <Box display="flex" gap={1} mb={2}>
                {['all', 'safe'].map((type) => (
                  <Chip
                    key={type}
                    label={type.toUpperCase()}
                    size="small"
                    onClick={() => setWalletTypeFilter(type as any)}
                    color={walletTypeFilter === type ? 'primary' : 'default'}
                    variant={walletTypeFilter === type ? 'filled' : 'outlined'}
                    sx={{ flex: 1, fontSize: '0.7rem' }}
                  />
                ))}
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={filteredClients.length > 0 && filteredClients.every((c) => c.selected)}
                    indeterminate={filteredClients.some((c) => c.selected) && !filteredClients.every((c) => c.selected)}
                    onChange={() => toggleSelectAll(filteredClients)}
                    size="small"
                  />
                }
                label={<Typography variant="body2">Select All Visible</Typography>}
                sx={{ mb: 1 }}
              />
              <Divider sx={{ mb: 1 }} />

              <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {isLoadingClients && clients.length === 0 ? (
                  <Box display="flex" justifyContent="center" p={2}>
                    <CircularProgress size={20} />
                  </Box>
                ) : (
                  filteredClients.map((client) => (
                    <Box
                      key={client.address}
                      sx={{
                        p: 1,
                        mb: 1,
                        borderRadius: 1,
                        border: 1,
                        borderColor: client.selected ? 'primary.main' : 'divider',
                        bgcolor: client.selected ? 'action.selected' : 'background.paper',
                        opacity: client.selected ? 1 : 0.8,
                      }}
                    >
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={client.selected}
                            onChange={() => toggleClient(client.address)}
                            size="small"
                            sx={{ p: 0.5, mr: 1, mt: -3 }}
                          />
                        }
                        label={
                          <Box>
                            <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
                              <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
                                {client.address.substring(0, 5)}...{client.address.substring(39)}
                              </Typography>
                              <Chip label={client.walletType} size="small" sx={{ height: 16, fontSize: '0.6rem' }} />
                            </Box>
                            <Typography variant="caption" color="text.secondary" display="block">
                              USDC: {parseFloat(client.usdcBalance || '0').toFixed(2)}
                            </Typography>
                          </Box>
                        }
                        sx={{ m: 0, width: '100%', alignItems: 'flex-start' }}
                      />
                    </Box>
                  ))
                )}
              </Box>

              <Button
                startIcon={<RefreshIcon />}
                onClick={refreshClients}
                size="small"
                variant="outlined"
                fullWidth
                sx={{ mt: 1 }}
              >
                Refresh
              </Button>
            </Box>
          )}
        </Paper>

        {/* === Main Content: Order Form + Chart (50/50 split) === */}
        <Box sx={{ flex: 1, display: 'flex', gap: 2, minWidth: 0, minHeight: 400 }}>
          {/* === Order Entry Form (50%) === */}
          <Paper
            elevation={2}
            sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', overflowY: 'auto', minWidth: 0 }}
          >
            {/* Messages */}
            {(message || tradeError) && (
              <Alert
                severity={message?.type === 'success' ? 'success' : 'error'}
                onClose={() => setMessage(null)}
                sx={{ mb: 2 }}
              >
                {message?.text || tradeError}
              </Alert>
            )}

            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography variant="h6" fontWeight={600}>
                Order Entry
              </Typography>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <Select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
                  <MenuItem value="market">
                    <Box display="flex" gap={1} alignItems="center">
                      <FlashOnIcon fontSize="small" /> Market
                    </Box>
                  </MenuItem>
                  <MenuItem value="twap">
                    <Box display="flex" gap={1} alignItems="center">
                      <ScheduleIcon fontSize="small" /> TWAP
                    </Box>
                  </MenuItem>
                  <MenuItem value="smart_market">
                    <Box display="flex" gap={1} alignItems="center">
                      <SmartToyIcon fontSize="small" /> Smart Market
                    </Box>
                  </MenuItem>
                  <MenuItem value="smart_twap">
                    <Box display="flex" gap={1} alignItems="center">
                      <AutoGraphIcon fontSize="small" /> Smart TWAP
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Grid container spacing={3}>
              {/* Tokens */}
              <Grid item xs={5}>
                <TextField
                  select
                  fullWidth
                  label="Sell"
                  value={tokenInSymbol}
                  onChange={(e) => setTokenInSymbol(e.target.value)}
                >
                  {tokenList.map((t) => (
                    <MenuItem key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={2} display="flex" justifyContent="center" alignItems="center">
                <IconButton onClick={handleSwapTokens} color="primary">
                  <SwapHoriz />
                </IconButton>
              </Grid>
              <Grid item xs={5}>
                <TextField
                  select
                  fullWidth
                  label="Buy"
                  value={tokenOutSymbol}
                  onChange={(e) => setTokenOutSymbol(e.target.value)}
                >
                  {tokenList.map((t) => (
                    <MenuItem key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Amount */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Amount"
                  type="number"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  InputProps={{
                    endAdornment: isQuoting ? (
                      <CircularProgress size={20} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        {tokenInSymbol}
                      </Typography>
                    ),
                  }}
                />
              </Grid>

              {/* Advanced Order Inputs */}
              {(orderType === 'smart_market' || orderType === 'smart_twap') && (
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Chunks"
                    type="number"
                    value={chunks}
                    onChange={(e) => setChunks(e.target.value)}
                    inputProps={{ min: 3, max: 10 }}
                    helperText="3-10 chunks"
                  />
                </Grid>
              )}
              {(orderType === 'twap' || orderType === 'smart_twap') && (
                <>
                  <Grid item xs={orderType === 'smart_twap' ? 6 : 6}>
                    <TextField
                      fullWidth
                      label="Slices"
                      type="number"
                      value={slices}
                      onChange={(e) => setSlices(e.target.value)}
                      inputProps={{ min: 2, max: 20 }}
                      helperText="2-20 slices"
                    />
                  </Grid>
                  <Grid item xs={orderType === 'smart_twap' ? 12 : 6}>
                    <TextField
                      fullWidth
                      label="Duration (Minutes)"
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                    />
                  </Grid>
                </>
              )}

              {/* Triggers */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Triggers (Optional)
                </Typography>
                <Box display="flex" gap={2} flexWrap="wrap" alignItems="flex-start">
                  {/* Price Trigger */}
                  <Box flex={1} display="flex" gap={1}>
                    <FormControl size="small" sx={{ width: 120 }}>
                      <Select value={priceTriggerType} onChange={(e) => setPriceTriggerType(e.target.value as any)}>
                        <MenuItem value="none">None</MenuItem>
                        <MenuItem value=">=">Price &ge;</MenuItem>
                        <MenuItem value="<=">Price &le;</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      size="small"
                      placeholder="Trigger Price"
                      fullWidth
                      disabled={priceTriggerType === 'none'}
                      value={priceTriggerValue}
                      onChange={(e) => setPriceTriggerValue(e.target.value)}
                    />
                  </Box>

                  {/* AND/OR Operator Toggle */}
                  {priceTriggerType !== 'none' && timeTriggerType !== 'none' && (
                    <Box display="flex" alignItems="center" justifyContent="center" sx={{ minWidth: 50 }}>
                      <Chip
                        label={triggerOperator}
                        onClick={() => setTriggerOperator((prev) => (prev === 'AND' ? 'OR' : 'AND'))}
                        color={triggerOperator === 'AND' ? 'primary' : 'default'}
                        variant={triggerOperator === 'AND' ? 'filled' : 'outlined'}
                        size="small"
                        sx={{ cursor: 'pointer', fontWeight: 700, minWidth: 48 }}
                      />
                    </Box>
                  )}

                  {/* Time Trigger + Timezone */}
                  <Box flex={1} display="flex" gap={1}>
                    <FormControl size="small" sx={{ width: 120 }}>
                      <Select value={timeTriggerType} onChange={(e) => setTimeTriggerType(e.target.value as any)}>
                        <MenuItem value="none">None</MenuItem>
                        <MenuItem value="at">Time At</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      size="small"
                      type="datetime-local"
                      fullWidth
                      disabled={timeTriggerType === 'none'}
                      value={timeTriggerValue}
                      onChange={(e) => setTimeTriggerValue(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                    {timeTriggerType !== 'none' && (
                      <FormControl size="small" sx={{ minWidth: 80 }}>
                        <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                          {TIMEZONES.map((tz) => (
                            <MenuItem key={tz} value={tz}>
                              {tz}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </Box>
                </Box>
              </Grid>

              {/* Slippage & Preview */}
              <Grid item xs={12}>
                <Box mb={2}>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    Slippage Tolerance
                  </Typography>
                  <Box display="flex" gap={1} mt={0.5}>
                    {['0.05', '1.0', '2.0'].map((val) => (
                      <Chip
                        key={val}
                        label={`${val}%`}
                        onClick={() => setSlippage(val)}
                        color={slippage === val ? 'primary' : 'default'}
                        variant={slippage === val ? 'filled' : 'outlined'}
                        size="small"
                      />
                    ))}
                  </Box>
                </Box>

                {/* COMPACT ORDER PREVIEW */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    flexWrap: 'wrap',
                  }}
                >
                  <Chip
                    label={orderType.replace('_', ' ').toUpperCase()}
                    size="small"
                    color="primary"
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
                  />

                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="body2" fontWeight={600}>
                      {amountIn || '0'} {tokenInSymbol}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      →
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={quoteAmountOut ? 'success.main' : 'text.primary'}
                    >
                      {quoteAmountOut ? parseFloat(quoteAmountOut).toFixed(4) : '-'} {tokenOutSymbol}
                    </Typography>
                  </Box>

                  <Divider orientation="vertical" flexItem />

                  <Box display="flex" gap={2}>
                    <Typography variant="caption" color="text.secondary">
                      Rate:{' '}
                      <Box component="span" fontWeight={600} color="text.primary">
                        {quoteAmountOut && amountIn
                          ? (parseFloat(quoteAmountOut) / parseFloat(amountIn)).toFixed(4)
                          : '-'}
                      </Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Slippage:{' '}
                      <Box component="span" fontWeight={600} color="text.primary">
                        {slippage}%
                      </Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Router:{' '}
                      <Box component="span" fontWeight={600} color="text.primary">
                        Uniswap V3
                      </Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Price Impact:{' '}
                      <Box
                        component="span"
                        fontWeight={600}
                        color={
                          priceImpact === null
                            ? 'text.primary'
                            : priceImpact > 1
                              ? 'error.main'
                              : priceImpact > 0.5
                                ? 'warning.main'
                                : 'success.main'
                        }
                      >
                        {priceImpact !== null ? `${priceImpact.toFixed(2)}%` : '-'}
                      </Box>
                    </Typography>
                  </Box>
                  {(chunks || slices || duration) && <Divider orientation="vertical" flexItem />}
                  <Box display="flex" gap={2}>
                    {chunks && (orderType === 'smart_market' || orderType === 'smart_twap') && (
                      <Typography variant="caption" color="text.secondary">
                        Chunks:{' '}
                        <Box component="span" fontWeight={600} color="text.primary">
                          {chunks}
                        </Box>
                      </Typography>
                    )}
                    {slices && (orderType === 'twap' || orderType === 'smart_twap') && (
                      <Typography variant="caption" color="text.secondary">
                        Slices:{' '}
                        <Box component="span" fontWeight={600} color="text.primary">
                          {slices}
                        </Box>
                      </Typography>
                    )}
                    {duration && (orderType === 'twap' || orderType === 'smart_twap') && (
                      <Typography variant="caption" color="text.secondary">
                        Duration:{' '}
                        <Box component="span" fontWeight={600} color="text.primary">
                          {duration}m
                        </Box>
                      </Typography>
                    )}
                  </Box>

                  {(priceTriggerType !== 'none' || timeTriggerType !== 'none') && (
                    <>
                      <Divider orientation="vertical" flexItem />
                      <Box display="flex" gap={1} alignItems="center">
                        {priceTriggerType !== 'none' && (
                          <Chip
                            icon={<TrendingUpIcon style={{ fontSize: 14 }} />}
                            label={`${priceTriggerType} ${priceTriggerValue}`}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem' }}
                          />
                        )}
                        {timeTriggerType !== 'none' && (
                          <Chip
                            icon={<ScheduleIcon style={{ fontSize: 14 }} />}
                            label={`At ${timeTriggerValue}`}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem' }}
                          />
                        )}
                      </Box>
                    </>
                  )}
                </Paper>
              </Grid>

              <Grid item xs={12}>
                {/* Execution Progress */}
                {currentOrder && isTrading && (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      mb: 2,
                      bgcolor: 'action.hover',
                      borderColor: 'primary.main',
                    }}
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Executing {orderType.replace('_', ' ').toUpperCase()}
                      </Typography>
                      <Chip
                        label={`${currentOrder.executedSlices}/${currentOrder.totalSlices} slices`}
                        size="small"
                        color="primary"
                      />
                    </Box>
                    <Box sx={{ width: '100%', bgcolor: 'grey.800', borderRadius: 1, height: 8 }}>
                      <Box
                        sx={{
                          width: `${currentOrder.progress}%`,
                          bgcolor: 'primary.main',
                          height: '100%',
                          borderRadius: 1,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </Box>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
                      <Typography variant="caption" color="text.secondary">
                        Volume: {currentOrder.executedVolume} {tokenInSymbol}
                      </Typography>
                      <Button size="small" color="error" onClick={cancelOrder} variant="outlined">
                        Cancel
                      </Button>
                    </Box>
                  </Paper>
                )}

                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={handleSubmit}
                  disabled={isTrading || selectedClients.length === 0 || !amountIn}
                  startIcon={isTrading ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                >
                  {priceTriggerType !== 'none' || timeTriggerType !== 'none'
                    ? 'Create Trigger Order'
                    : orderType === 'market'
                      ? 'Execute Swap'
                      : `Execute ${orderType.replace('_', ' ').toUpperCase()}`}
                </Button>
                {selectedClients.length > 0 && (
                  <Typography variant="caption" align="center" display="block" sx={{ mt: 1 }}>
                    Applying to {selectedClients.length} Wallets
                  </Typography>
                )}
              </Grid>
            </Grid>
          </Paper>

          {/* === TradingView Chart (50%) === */}
          <Paper
            elevation={2}
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 400,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: 2,
            }}
          >
            <TradingViewChart tokenIn={tokenInSymbol} tokenOut={tokenOutSymbol} />
          </Paper>
        </Box>
      </Box>

      {/* 
          BOTTOM ROW: Orders Table 
          Full width
      */}
      <Paper sx={{ flexShrink: 0, height: 300, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box p={2} borderBottom={1} borderColor="divider" display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" fontWeight={600}>
            Active Orders & History
          </Typography>
          <Tooltip title="Export slippage analytics to CSV">
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadAnalyticsCSV}
              sx={{ textTransform: 'none' }}
            >
              Export CSV
            </Button>
          </Tooltip>
        </Box>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2, minHeight: 48 }}
        >
          <Tab label={`Pending (${pendingOrders.length})`} />
          <Tab label={`Filled (${filledOrders.length})`} />
          <Tab label={`Failed (${failedOrders.length})`} />
        </Tabs>

        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table stickyHeader size="small">
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
                      color={order.type.includes('smart') ? 'secondary' : 'primary'}
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
                    <Typography variant="body2">{order.amountIn}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {order.triggerPrice
                        ? parseFloat(order.triggerPrice).toFixed(4)
                        : order.timeTrigger
                          ? new Date(order.timeTrigger).toLocaleTimeString()
                          : '-'}
                    </Typography>
                    {order.limitPrice && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        Limit: {parseFloat(order.limitPrice).toFixed(4)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.triggerCondition && (
                      <Chip
                        label={order.triggerCondition === 'below' ? 'Below' : 'Above'}
                        size="small"
                        color={order.triggerCondition === 'below' ? 'error' : 'success'}
                        variant="outlined"
                      />
                    )}
                    {order.timeTrigger && <Chip label="Time" size="small" variant="outlined" />}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={order.status}
                      size="small"
                      color={
                        order.status === 'filled'
                          ? 'success'
                          : order.status === 'pending'
                            ? 'warning'
                            : order.status === 'triggered'
                              ? 'info'
                              : 'error'
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {order.status === 'pending' && (
                      <IconButton size="small" color="error" onClick={() => handleDeleteOrder(order.id)}>
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
    </Box>
  )
}
