import { useState } from 'react'
import {
  Box,
  Typography,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  FormControl,
  Tooltip,
  Chip,
  Avatar,
} from '@mui/material'
import PublicIcon from '@mui/icons-material/Public'

import { useManagerStats } from '../../../hooks/manager/useManagerStats'

export default function Home() {
  const { summary, isLoading } = useManagerStats()
  const [selectedChain, setSelectedChain] = useState('Arbitrum')

  const formatUSD = (value: number) =>
    value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
  const formatNum = (value: number) => value.toLocaleString('en-US')

  const kpiCards = [
    { title: 'Net Asset Value', value: isLoading ? '--' : formatUSD(summary.totalAUM) },
    { title: 'Margin Available', value: '--' }, // Requires position calculation
    { title: 'Margin Used', value: '--' }, // Requires position calculation
    { title: 'Active Accounts', value: isLoading ? '--' : formatNum(summary.totalClients) },
    { title: 'Running PnL', value: isLoading ? '--' : formatUSD(summary.unrealizedPnL) },
  ]

  // Filter portfolio based on selected chain
  // Currently only Arbitrum has real data logic in the hook
  const portfolioData = selectedChain === 'Arbitrum' ? summary.portfolio : []

  return (
    <Box>
      {/* Welcome Header */}
      <Box sx={{ mb: 6 }}>
        <Typography variant="h1" fontWeight={700} gutterBottom sx={{ color: 'text.primary' }}>
          Welcome, Manager!
        </Typography>
        <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400 }}>
          Manage your clients and trading terminal here.
        </Typography>
      </Box>

      {/* KPI Cards Grid */}
      <Grid container spacing={3} sx={{ mb: 6 }}>
        {kpiCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={2.4} key={index}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                height: '100%',
                bgcolor: 'var(--color-background-paper)',
                border: '1px solid var(--color-border-light)',
                borderRadius: 4,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
                  borderColor: 'primary.main',
                },
              }}
            >
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600} gutterBottom>
                {card.title}
              </Typography>
              <Typography variant="h4" fontWeight={700} color="text.primary">
                {card.value}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Portfolio Overview Table */}
      <Box mb={6}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h3" fontWeight={700}>
            Portfolio Overview
          </Typography>
          <FormControl sx={{ minWidth: 150 }} size="small">
            <Select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value)}
              displayEmpty
              renderValue={(selected) => (
                <Box display="flex" alignItems="center" gap={1}>
                  <PublicIcon fontSize="small" color="action" />
                  {selected}
                </Box>
              )}
              sx={{
                borderRadius: 2,
                bgcolor: 'var(--color-background-paper)',
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'var(--color-border-light)' },
              }}
            >
              <MenuItem value="Arbitrum">Arbitrum</MenuItem>
              <MenuItem value="BNB">BNB Chain</MenuItem>
              <MenuItem value="Solana">Solana</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            bgcolor: 'var(--color-background-paper)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <Table sx={{ minWidth: 650 }}>
            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Asset</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }} align="right">
                  Balance
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }} align="right">
                  Value (USD)
                </TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }} align="right">
                  Clients
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    Loading assets...
                  </TableCell>
                </TableRow>
              ) : portfolioData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No assets found on {selectedChain}.
                  </TableCell>
                </TableRow>
              ) : (
                portfolioData.map((asset) => (
                  <TableRow key={asset.symbol} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1.5}>
                        {/* Placeholder icon if needed, or just text */}
                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem', bgcolor: 'primary.main' }}>
                          {asset.symbol[0]}
                        </Avatar>
                        <Typography fontWeight={600}>{asset.symbol}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontFamily="monospace">
                        {asset.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={500}>
                        {formatUSD(asset.value)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip
                        title={
                          <Box sx={{ p: 0.5 }}>
                            <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
                              Holders:
                            </Typography>
                            {asset.holders.map((h) => (
                              <div key={h.address} style={{ fontFamily: 'monospace' }}>
                                {h.address.substring(0, 6)}...{h.address.substring(38)} ({h.walletType})
                              </div>
                            ))}
                          </Box>
                        }
                        arrow
                        placement="left"
                      >
                        <Chip
                          label={`${asset.holders.length} Clients`}
                          size="small"
                          variant="outlined"
                          sx={{ cursor: 'help', borderColor: 'rgba(255,255,255,0.1)' }}
                        />
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Asset-wise Performance Table (Placeholder/Legacy) */}
      <Box>
        <Typography variant="h3" fontWeight={700} gutterBottom sx={{ mb: 3 }}>
          Asset-wise Performance Overview
        </Typography>

        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            bgcolor: 'var(--color-background-paper)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 4,
            opacity: 0.7, // Visual indication of disabled state
            pointerEvents: 'none', // Disable interaction
          }}
        >
          <Table sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Asset</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Margin</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Side</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Leverage</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Unrealised PnL</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                  <Typography variant="h6" color="text.secondary" fontStyle="italic">
                    perp trading coming soon
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  )
}
