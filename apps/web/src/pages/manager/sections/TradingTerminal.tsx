'use client'

import { useState, useEffect, useCallback } from 'react'
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
} from '@mui/material'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import RefreshIcon from '@mui/icons-material/Refresh'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import SettingsIcon from '@mui/icons-material/Settings'
import GroupIcon from '@mui/icons-material/Group'
import { useDelegationModule } from '../../../hooks/useDelegationModule'
import { useTradingModule } from '../../../hooks/useTradingModule'
import { TOKENS, FEE_TIERS, TOKENS_BY_CHAIN, TRADING_MODULE_ADDRESSES } from '../../../contracts/TradingModule'
import { Contract } from 'ethers'
import useWallet from '@/hooks/wallets/useWallet'

interface ClientInfo {
  address: string
  permissions: number
  isActive: boolean
  selected: boolean
  walletType: 'eoa' | 'safe'
  approvals?: string[]
}

const DEFAULT_TOKEN_LIST = [
  { symbol: 'WETH', address: TOKENS.WETH.address, decimals: 18 },
  { symbol: 'USDC', address: TOKENS.USDC.address, decimals: 6 },
]

export default function TradingTerminal() {
  // Use Safe's wallet hook
  const wallet = useWallet()
  const walletAddress = wallet?.address || ''

  // Client selection (multi-select for batch)
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [walletTypeFilter, setWalletTypeFilter] = useState<'all' | 'eoa' | 'safe'>('all')

  // Trade form
  const [tokenList, setTokenList] = useState(DEFAULT_TOKEN_LIST)
  const [tokenIn, setTokenIn] = useState(DEFAULT_TOKEN_LIST[0]) // WETH
  const [tokenOut, setTokenOut] = useState(DEFAULT_TOKEN_LIST[1]) // USDC
  const [amountIn, setAmountIn] = useState('')
  const [slippage, setSlippage] = useState('0.5')

  // Limit form
  const [newDailyLimit, setNewDailyLimit] = useState('')
  const [_error, setError] = useState<string | null>(null)

  // Hooks
  const { getManagerClients, getDelegation } = useDelegationModule()
  const {
    isLoading: isTrading,
    error: tradeError,
    executeTrade,
    executeBatchTrade,
    setDailyLimit,
    calculateFee,
    getQuote,
  } = useTradingModule()

  const [quoteAmountOut, setQuoteAmountOut] = useState('')
  const [isQuoting, setIsQuoting] = useState(false)

  const [successMessage, setSuccessMessage] = useState<string>('')
  const [_estimatedFee, setEstimatedFee] = useState<string>('0')

  // Selected clients for operations
  const selectedClients = clients.filter((c) => c.selected)
  const singleSelectedClient = selectedClients.length === 1 ? selectedClients[0] : null

  // Load clients
  const loadClients = useCallback(async () => {
    if (!walletAddress) return

    try {
      const provider = new BrowserProvider(window.ethereum as any)
      const clientAddresses = await getManagerClients(walletAddress)
      const clientList: ClientInfo[] = []

      const network = await provider.getNetwork()
      const chainId = Number(network.chainId)
      const tradingModule = TRADING_MODULE_ADDRESSES[chainId]
      const tokens = TOKENS_BY_CHAIN[chainId]

      // Update token list for current chain
      if (tokens) {
        const list = Object.values(tokens)
        setTokenList(list)
        // Optionally update selected tokens if addresses mismtach
        if (tokenIn.address !== list.find((t) => t.symbol === tokenIn.symbol)?.address) {
          setTokenIn(list.find((t) => t.symbol === 'WETH') || list[0])
          setTokenOut(list.find((t) => t.symbol === 'USDC') || list[1] || list[0])
        }
      }

      for (const addr of clientAddresses) {
        const delegation = await getDelegation(addr, walletAddress)
        if (delegation) {
          const code = await provider.getCode(addr)
          const walletType = code && code !== '0x' ? 'safe' : 'eoa'

          // Check approvals
          const approvals: string[] = []
          if (tradingModule && tokens) {
            await Promise.all(
              Object.values(tokens).map(async (t) => {
                if (!t.address || t.address === '0na') return
                try {
                  const contract = new Contract(
                    t.address,
                    ['function allowance(address,address) view returns (uint256)'],
                    provider,
                  )
                  const allowance = await contract.allowance(addr, tradingModule)
                  if (allowance > 0n) approvals.push(t.symbol)
                } catch (e) {
                  console.warn('Allowance check failed', t.symbol)
                }
              }),
            )
          }

          clientList.push({
            address: addr,
            permissions: delegation.permissions,
            isActive: delegation.isActive,
            selected: clientList.length === 0,
            walletType,
            approvals,
          })
        }
      }

      setClients(clientList)
    } catch (err) {
      console.error('Failed to load clients:', err)
    }
  }, [walletAddress, getManagerClients, getDelegation, tokenIn.address, tokenIn.symbol])

  // Calculate fee when amount changes
  useEffect(() => {
    if (amountIn && parseFloat(amountIn) > 0) {
      calculateFee(amountIn).then(setEstimatedFee)

      // Get Quote
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

  useEffect(() => {
    if (walletAddress) {
      loadClients()
    }
  }, [walletAddress, loadClients])

  // Toggle client selection
  const toggleClient = (address: string) => {
    setClients((prev) => prev.map((c) => (c.address === address ? { ...c, selected: !c.selected } : c)))
  }

  // Select/deselect all
  const toggleSelectAll = () => {
    const allSelected = clients.every((c) => c.selected)
    setClients((prev) => prev.map((c) => ({ ...c, selected: !allSelected })))
  }

  // Swap tokens
  const handleSwapTokens = () => {
    const temp = tokenIn
    setTokenIn(tokenOut)
    setTokenOut(temp)
  }

  // Execute trade (single or batch)
  const handleTrade = async () => {
    if (selectedClients.length === 0 || !amountIn) {
      alert('Select clients and enter amount')
      return
    }

    setSuccessMessage('')
    const deadline = Math.floor(Date.now() / 1000) + 600

    // Calculate min amount out from slippage
    // Base on Quote if available, otherwise 0
    const estimatedOutput = quoteAmountOut ? parseFloat(quoteAmountOut) : 0
    const slippagePercent = parseFloat(slippage) / 100
    const calculatedMinOut = (estimatedOutput * (1 - slippagePercent)).toFixed(tokenOut.decimals)

    try {
      if (selectedClients.length === 1) {
        // Single trade
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
        setSuccessMessage(`Trade executed! Tx: ${txHash.substring(0, 10)}...`)
      } else {
        // Batch trade
        const safes = selectedClients.map((c) => c.address)
        const amounts = selectedClients.map(() => amountIn) // Same amount for all

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
        setSuccessMessage(`Batch trade for ${safes.length} clients! Tx: ${txHash.substring(0, 10)}...`)
      }

      setAmountIn('')
    } catch (err: any) {
      console.error('Trade failed:', err)
      if (err.message && err.message.includes('swap failed')) {
        setError('Swap failed. Ensure all clients have sufficient balance & enabled Trading Module.')
      } else {
        setError(err.message || 'Trade failed')
      }
    }
  }

  // Set daily limit
  const handleSetLimit = async () => {
    if (!singleSelectedClient || !newDailyLimit) {
      alert('Select one client and enter limit')
      return
    }

    setSuccessMessage('')
    try {
      const txHash = await setDailyLimit(singleSelectedClient.address, newDailyLimit)
      setSuccessMessage(`Daily limit set! Tx: ${txHash.substring(0, 10)}...`)
      setNewDailyLimit('')
    } catch (err) {
      console.error('Failed to set limit:', err)
    }
  }

  return (
    <Box>
      {tradeError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {tradeError}
        </Alert>
      )}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}
      <Grid container spacing={3}>
        {/* Client Selection with Multi-Select */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle2" fontWeight={600}>
                <GroupIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Clients
              </Typography>
              <Badge badgeContent={selectedClients.length} color="primary">
                <Chip
                  label={selectedClients.length > 1 ? 'Batch Mode' : 'Single'}
                  size="small"
                  color={selectedClients.length > 1 ? 'primary' : 'default'}
                />
              </Badge>
            </Box>

            {clients.length === 0 ? (
              <Alert severity="info">No clients delegated yet.</Alert>
            ) : (
              <>
                {/* Wallet Type Filters */}
                <Box display="flex" gap={1} mb={2}>
                  <Chip
                    label={`All (${clients.length})`}
                    size="small"
                    color={walletTypeFilter === 'all' ? 'primary' : 'default'}
                    onClick={() => setWalletTypeFilter('all')}
                    variant={walletTypeFilter === 'all' ? 'filled' : 'outlined'}
                  />
                  <Chip
                    label={`Safe (${clients.filter((c) => c.walletType === 'safe').length})`}
                    size="small"
                    color={walletTypeFilter === 'safe' ? 'primary' : 'default'}
                    onClick={() => setWalletTypeFilter('safe')}
                    variant={walletTypeFilter === 'safe' ? 'filled' : 'outlined'}
                  />
                  <Chip
                    label={`EOA (${clients.filter((c) => c.walletType === 'eoa').length})`}
                    size="small"
                    color={walletTypeFilter === 'eoa' ? 'primary' : 'default'}
                    onClick={() => setWalletTypeFilter('eoa')}
                    variant={walletTypeFilter === 'eoa' ? 'filled' : 'outlined'}
                  />
                </Box>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={clients
                        .filter((c) => walletTypeFilter === 'all' || c.walletType === walletTypeFilter)
                        .every((c) => c.selected)}
                      indeterminate={
                        selectedClients.length > 0 &&
                        selectedClients.length <
                        clients.filter((c) => walletTypeFilter === 'all' || c.walletType === walletTypeFilter).length
                      }
                      onChange={toggleSelectAll}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      Select All (
                      {clients.filter((c) => walletTypeFilter === 'all' || c.walletType === walletTypeFilter).length})
                    </Typography>
                  }
                />
                <Divider sx={{ my: 1 }} />

                <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
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
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {client.address.substring(0, 8)}...{client.address.substring(36)}
                            </Typography>
                            <Chip
                              label={client.walletType.toUpperCase()}
                              size="small"
                              color={client.walletType === 'safe' ? 'info' : 'warning'}
                              sx={{ height: 18, fontSize: '0.65rem' }}
                            />
                            {/* Approvals */}
                            <Box display="flex" gap={0.5}>
                              {client.approvals?.map((symbol) => (
                                <Chip
                                  key={symbol}
                                  label={symbol}
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                  sx={{ height: 16, fontSize: '0.6rem' }}
                                />
                              ))}
                            </Box>
                          </Box>
                        }
                        sx={{ display: 'block', mb: 0.5 }}
                      />
                    ))}
                </Box>
              </>
            )}

            <Button startIcon={<RefreshIcon />} onClick={loadClients} size="small" sx={{ mt: 1 }}>
              Refresh
            </Button>
          </Paper>
        </Grid>

        {/* Trade Form */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight={600}>
                {selectedClients.length > 1 ? `Batch Swap` : 'Swap'}
              </Typography>
              {selectedClients.length > 1 && (
                <Chip label={`${selectedClients.length} clients`} size="small" color="primary" />
              )}
            </Box>

            {/* You Pay */}
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
                  InputProps={{
                    disableUnderline: true,
                    sx: { fontSize: '1.5rem', fontWeight: 500 },
                  }}
                />
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <Select
                    value={tokenIn.symbol}
                    onChange={(e) => {
                      const token = tokenList.find((t) => t.symbol === e.target.value)
                      if (token) {
                        if (token.symbol === tokenOut.symbol) {
                          setTokenOut(tokenIn)
                        }
                        setTokenIn(token)
                      }
                    }}
                    sx={{ fontWeight: 600 }}
                  >
                    {tokenList.map((token) => (
                      <MenuItem key={token.symbol} value={token.symbol}>
                        {token.symbol}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Paper>

            {/* Swap Arrow */}
            <Box display="flex" justifyContent="center" my={-0.5} position="relative" zIndex={1}>
              <IconButton
                onClick={handleSwapTokens}
                sx={{
                  bgcolor: 'primary.main',
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' },
                }}
              >
                <SwapVertIcon />
              </IconButton>
            </Box>

            {/* You Receive */}
            <Paper sx={{ p: 2, mt: -0.5, bgcolor: 'rgba(255,255,255,0.05)' }}>
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography variant="caption" color="text.secondary">
                  You Receive (estimated)
                </Typography>
              </Box>
              <Box display="flex" gap={2} alignItems="center">
                <Typography variant="h5" sx={{ flex: 1, color: isQuoting ? 'text.secondary' : 'text.primary' }}>
                  {isQuoting
                    ? 'Fetching...'
                    : quoteAmountOut
                      ? '~' + parseFloat(quoteAmountOut).toLocaleString(undefined, { maximumFractionDigits: 9 })
                      : '0.0'}
                </Typography>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <Select
                    value={tokenOut.symbol}
                    onChange={(e) => {
                      const token = tokenList.find((t) => t.symbol === e.target.value)
                      if (token) {
                        if (token.symbol === tokenIn.symbol) {
                          setTokenIn(tokenOut)
                        }
                        setTokenOut(token)
                      }
                    }}
                    sx={{ fontWeight: 600 }}
                  >
                    {tokenList.map((token) => (
                      <MenuItem key={token.symbol} value={token.symbol}>
                        {token.symbol}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Paper>

            {/* Slippage Tolerance */}
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
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Box>

            {/* Fee & Summary */}
            {amountIn && parseFloat(amountIn) > 0 && (
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, p: 1.5, mt: 2 }}>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="caption" color="text.secondary">
                    Min. Receive
                  </Typography>
                  <Typography variant="caption">
                    {(parseFloat(quoteAmountOut || '0') * (1 - parseFloat(slippage) / 100)).toLocaleString(undefined, {
                      maximumFractionDigits: 9,
                    })}{' '}
                    {tokenOut.symbol}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">
                    Platform Fee (0.1%)
                  </Typography>
                  <Typography variant="caption">
                    {(parseFloat(amountIn) * 0.001).toFixed(6)} {tokenIn.symbol}
                    {selectedClients.length > 1 && ` × ${selectedClients.length}`}
                  </Typography>
                </Box>
              </Box>
            )}

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleTrade}
              disabled={isTrading || selectedClients.length === 0 || !amountIn}
              startIcon={isTrading ? <CircularProgress size={20} /> : <TrendingUpIcon />}
              sx={{ mt: 2, py: 1.5, fontSize: '1rem', fontWeight: 600 }}
            >
              {isTrading
                ? 'Executing...'
                : selectedClients.length === 0
                  ? 'Select Client(s)'
                  : selectedClients.length > 1
                    ? `Swap for ${selectedClients.length} Clients`
                    : 'Swap'}
            </Button>
          </Paper>
        </Grid>

        {/* Daily Limit Settings */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <SettingsIcon fontSize="small" />
              <Typography variant="subtitle2" fontWeight={600}>
                Set Daily Limit
              </Typography>
            </Box>

            {selectedClients.length !== 1 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Select exactly 1 client to set limit
              </Alert>
            )}

            <TextField
              fullWidth
              size="small"
              label="Daily Limit (USD)"
              value={newDailyLimit}
              onChange={(e) => setNewDailyLimit(e.target.value)}
              type="number"
              placeholder="10000"
              disabled={selectedClients.length !== 1}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
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
    </Box>
  )
}
