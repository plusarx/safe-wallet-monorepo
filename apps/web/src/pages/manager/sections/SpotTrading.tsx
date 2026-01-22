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
import { Tabs, Tab } from '@mui/material'

import { useTradingModule } from '../../../hooks/useTradingModule'
import { TOKENS, FEE_TIERS, TOKENS_BY_CHAIN } from '../../../contracts/TradingModule'
import type { ClientInfo } from '../../../hooks/manager/useManagerClients'

// --- Types ---

export type OrderType = 'market' | 'twap' | 'smart_market' | 'smart_twap'

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
  limitPrice?: string // Added for new table compatibility
  triggerCondition?: 'above' | 'below'
  timeTrigger?: string
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
  const {
    isLoading: isTrading,
    error: tradeError,
    executeTrade,
    executeBatchTrade,

    getQuote,
  } = useTradingModule()

  const [orderType, setOrderType] = useState<OrderType>('market')
  const [tokenList, setTokenList] = useState(DEFAULT_TOKEN_LIST)
  const [tokenInSymbol, setTokenInSymbol] = useState(DEFAULT_TOKEN_LIST[0].symbol)
  const [tokenOutSymbol, setTokenOutSymbol] = useState(DEFAULT_TOKEN_LIST[1].symbol)
  const [amountIn, setAmountIn] = useState('')
  const [slippage, setSlippage] = useState('1.0') // Default 1%

  // Triggers
  const [priceTriggerType, setPriceTriggerType] = useState<'none' | '>=' | '<='>('none')
  const [priceTriggerValue, setPriceTriggerValue] = useState('')
  const [timeTriggerType, setTimeTriggerType] = useState<'none' | 'at'>('none')
  const [timeTriggerValue, setTimeTriggerValue] = useState('')

  // Quote / Estimation
  const [quoteAmountOut, setQuoteAmountOut] = useState('')
  const [isQuoting, setIsQuoting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // --- Orders State ---
  const [orders, setOrders] = useState<TriggerOrder[]>([])
  const [tabValue, setTabValue] = useState(0)

  // Derived Lists
  const pendingOrders = orders.filter((o) => ['pending', 'triggered'].includes(o.status))
  const filledOrders = orders.filter((o) => o.status === 'filled')
  const failedOrders = orders.filter((o) => ['cancelled', 'failed'].includes(o.status))

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

  // --- Effects ---

  // Load Tokens and Orders
  useEffect(() => {
    // Orders
    const saved = localStorage.getItem(ORDERS_KEY)
    if (saved) {
      try {
        setOrders(JSON.parse(saved).reverse())
      } catch (e) {
        console.error(e)
      }
    }

    // Tokens (Mock / Chain load)
    const cId = 42161
    const tokens = TOKENS_BY_CHAIN[cId]
    if (tokens) {
      setTokenList(Object.values(tokens))
    }
  }, [])

  // Quote Logic
  useEffect(() => {
    if (amountIn && parseFloat(amountIn) > 0) {
      setIsQuoting(true)
      const delay = setTimeout(() => {
        getQuote(tokenIn.address, tokenOut.address, amountIn, FEE_TIERS.MEDIUM, tokenIn.decimals, tokenOut.decimals)
          .then((amount) => {
            setQuoteAmountOut(amount)
            setIsQuoting(false)
          })
          .catch(() => setIsQuoting(false))
      }, 500)
      return () => clearTimeout(delay)
    } else {
      setQuoteAmountOut('')
      setIsQuoting(false)
    }
  }, [amountIn, tokenIn, tokenOut, getQuote])

  // --- Handlers ---

  const handleSwapTokens = () => {
    const temp = tokenInSymbol
    setTokenInSymbol(tokenOutSymbol)
    setTokenOutSymbol(temp)
    setQuoteAmountOut('')
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

    // Prepare Execution
    if (orderType === 'market' && priceTriggerType === 'none' && timeTriggerType === 'none') {
      // Immediate Execution
      try {
        const deadline = Math.floor(Date.now() / 1000) + 600
        const estOut = parseFloat(quoteAmountOut || '0')
        const minOut = (estOut * (1 - parseFloat(slippage) / 100)).toFixed(tokenOut.decimals)

        if (selectedClients.length === 1) {
          await executeTrade({
            safe: selectedClients[0].address,
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            amountIn,
            minAmountOut: minOut,
            feeTier: FEE_TIERS.MEDIUM,
            deadline,
            tokenInDecimals: tokenIn.decimals,
            tokenOutDecimals: tokenOut.decimals,
          })
        } else {
          await executeBatchTrade({
            safes: selectedClients.map((c) => c.address),
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            amounts: selectedClients.map(() => amountIn),
            minAmountOut: minOut,
            feeTier: FEE_TIERS.MEDIUM,
            deadline,
            tokenInDecimals: tokenIn.decimals,
            tokenOutDecimals: tokenOut.decimals,
          })
        }
        setMessage({ type: 'success', text: 'Market Trade Executed!' })
        setAmountIn('')
      } catch (e: any) {
        console.error(e)
        setMessage({ type: 'error', text: e.message || 'Trade Failed' })
      }
    } else {
      // Create Trigger Order
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
        status: 'pending',
        createdAt: new Date().toISOString(),
      }

      const updated = [newOrder, ...orders]
      setOrders(updated)
      localStorage.setItem(ORDERS_KEY, JSON.stringify(updated.slice().reverse())) // Assuming storage likes append? keeping simple
      setMessage({ type: 'success', text: 'Order Created!' })
      setAmountIn('')
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
            width: isSidebarOpen ? 320 : 64,
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
                {['all', 'safe', 'eoa'].map((type) => (
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

        {/* === Order Entry Form === */}
        <Paper elevation={2} sx={{ flex: 1, p: 3, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
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

            {/* Triggers */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                Triggers (Optional)
              </Typography>
              <Box display="flex" gap={2} flexWrap="wrap">
                <Box flex={1} display="flex" gap={1}>
                  <FormControl size="small" sx={{ width: 100 }}>
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
                <Box flex={1} display="flex" gap={1}>
                  <FormControl size="small" sx={{ width: 100 }}>
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
                  gap: 15,
                  flexWrap: 'nowrap',
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
                  <Typography variant="body2" fontWeight={600} color={quoteAmountOut ? 'success.main' : 'text.primary'}>
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
              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleSubmit}
                disabled={isTrading || selectedClients.length === 0 || !amountIn}
                startIcon={isTrading ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
              >
                {orderType === 'market' && priceTriggerType === 'none' && timeTriggerType === 'none'
                  ? 'Execute Swap'
                  : 'Submit Order'}
              </Button>
              {selectedClients.length > 0 && (
                <Typography variant="caption" align="center" display="block" sx={{ mt: 1 }}>
                  Applying to {selectedClients.length} Wallets
                </Typography>
              )}
            </Grid>
          </Grid>
        </Paper>
      </Box>

      {/* 
          BOTTOM ROW: Orders Table 
          Full width
      */}
      {/* 
          BOTTOM ROW: Orders Table 
          Full width
      */}
      <Paper sx={{ mt: 2, flexShrink: 0, height: 350, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box p={2} borderBottom={1} borderColor="divider">
          <Typography variant="subtitle1" fontWeight={600}>
            Active Orders & History
          </Typography>
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
