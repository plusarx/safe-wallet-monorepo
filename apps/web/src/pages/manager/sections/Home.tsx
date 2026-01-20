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
} from '@mui/material'

import { useManagerStats } from '../../../hooks/manager/useManagerStats'

export default function Home() {
  const { summary, isLoading } = useManagerStats()

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

      {/* Asset-wise Performance Table */}
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
