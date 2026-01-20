import { useState } from 'react'
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import GroupIcon from '@mui/icons-material/Group'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import SearchIcon from '@mui/icons-material/Search'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'

import { useManagerStats } from '../../../hooks/manager/useManagerStats'

export default function Summary() {
  const { summary, executions, isLoading, error, refresh: loadData } = useManagerStats()
  const [searchQuery, setSearchQuery] = useState('')
  const [tabValue, setTabValue] = useState(0)

  const shortenAddress = (addr: string) => `${addr.substring(0, 8)}...${addr.substring(addr.length - 6)}`
  const shortenHash = (hash: string) => `${hash.substring(0, 10)}...${hash.substring(hash.length - 6)}`

  const formatUSD = (value: number) => {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success'
      case 'pending':
        return 'warning'
      case 'failed':
        return 'error'
      default:
        return 'default'
    }
  }

  const filteredExecutions = executions.filter(
    (exec) =>
      exec.safe.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exec.tokenIn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exec.txHash.toLowerCase().includes(searchQuery.toLowerCase()),
  )

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

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Key Metrics */}
      <Grid container spacing={2} mb={4}>
        <Grid item xs={6} md={3}>
          <Paper
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 120,
            }}
          >
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
          <Paper
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 120,
            }}
          >
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
          <Paper
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 120,
            }}
          >
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
          <Paper
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 120,
            }}
          >
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

      {/* Performance + Execution Details Grid */}
      <Grid container spacing={3}>
        {/* Performance */}
        <Grid item xs={12} md={12} lg={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>
              Performance Overview
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

        {/* Execution Details Table */}
        <Grid item xs={12} md={12} lg={8}>
          <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              p={2}
              borderBottom="1px solid var(--color-border-light)"
            >
              <Typography variant="subtitle1" fontWeight={600}>
                Execution History
              </Typography>
              <Chip
                label="Live"
                size="small"
                color="success"
                variant="outlined"
                avatar={<CircularProgress size={8} color="success" />}
              />
            </Box>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, bgcolor: 'var(--color-background-paper)' }}>
              <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} variant="scrollable" scrollButtons="auto">
                <Tab label={`All (${executions.length})`} sx={{ minHeight: 48 }} />
                <Tab
                  label={`Success (${executions.filter((e) => e.status === 'success').length})`}
                  sx={{ minHeight: 48 }}
                />
                <Tab
                  label={`Failed (${executions.filter((e) => e.status === 'failed').length})`}
                  sx={{ minHeight: 48 }}
                />
              </Tabs>
            </Box>

            <Box p={2}>
              <TextField
                size="small"
                placeholder="Search client, token, hash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <Box flexGrow={1} sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {isLoading && executions.length === 0 ? (
                <Box display="flex" justifyContent="center" py={4}>
                  <CircularProgress />
                </Box>
              ) : executions.length === 0 ? (
                <Alert severity="info" sx={{ m: 2 }}>
                  No executions found yet.
                </Alert>
              ) : (
                <TableContainer sx={{ minHeight: 300, maxHeight: 500 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ bgcolor: 'var(--color-background-paper)' }}>Time</TableCell>
                        <TableCell sx={{ bgcolor: 'var(--color-background-paper)' }}>Client</TableCell>
                        <TableCell sx={{ bgcolor: 'var(--color-background-paper)' }}>Type</TableCell>
                        <TableCell sx={{ bgcolor: 'var(--color-background-paper)' }}>Trade</TableCell>
                        <TableCell align="right" sx={{ bgcolor: 'var(--color-background-paper)' }}>
                          Amount
                        </TableCell>
                        <TableCell sx={{ bgcolor: 'var(--color-background-paper)' }}>Status</TableCell>
                        <TableCell sx={{ bgcolor: 'var(--color-background-paper)' }}></TableCell>
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
                              <Typography variant="body2" fontSize="0.75rem">
                                {exec.timestamp.toLocaleString()}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                                {shortenHash(exec.txHash)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                                {shortenAddress(exec.safe)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={exec.type}
                                color={exec.type === 'batch' ? 'secondary' : 'primary'}
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={`${exec.tokenIn} → ${exec.tokenOut}`}
                                color="default"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight={600} fontSize="0.8rem">
                                {parseFloat(exec.amountIn).toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
                                {exec.tokenIn}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={exec.status}
                                color={getStatusColor(exec.status) as any}
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
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
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
