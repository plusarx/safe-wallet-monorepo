'use client'

import { useState } from 'react'
import { Box, Typography, Paper, Tabs, Tab, Alert, Chip, Divider, Skeleton, IconButton } from '@mui/material'
import InfoIcon from '@mui/icons-material/Info'
import LinkIcon from '@mui/icons-material/Link'
import RefreshIcon from '@mui/icons-material/Refresh'

// Hooks and Contracts
import { useManagerStats } from '../../../hooks/manager/useManagerStats'

// Child Component for Tab 2
import OnboardingLinks from './OnboardingLinks'

// Tab helpers
interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`clients-tabpanel-${index}`}
      aria-labelledby={`clients-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  )
}

function a11yProps(index: number) {
  return {
    id: `clients-tab-${index}`,
    'aria-controls': `clients-tabpanel-${index}`,
  }
}

export default function Clients() {
  const [tabValue, setTabValue] = useState(0)

  // -- Consolidated Logic using Hook --
  const { clients, isLoading, error, refresh } = useManagerStats()

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  const shortenAddress = (addr: string) => `${addr.substring(0, 8)}...${addr.substring(addr.length - 6)}`
  const formatUSD = (value: number) =>
    value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

  return (
    <Box sx={{ width: '100%' }}>
      {/* Sub-tabs Navigation */}
      <Paper sx={{ mb: 0, bgcolor: 'var(--color-background-paper)', borderRadius: 2 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="client tabs"
          sx={{
            px: 2,
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '1rem',
              minHeight: 64,
            },
          }}
        >
          <Tab icon={<InfoIcon />} iconPosition="start" label="Client Details" {...a11yProps(0)} />
          <Tab icon={<LinkIcon />} iconPosition="start" label="Client Onboarding" {...a11yProps(1)} />
        </Tabs>
      </Paper>

      {/* Tab 1: Client Details */}
      <CustomTabPanel value={tabValue} index={0}>
        <Paper sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              Client Wallets ({clients.length})
            </Typography>
            <IconButton onClick={refresh} disabled={isLoading} size="small">
              <RefreshIcon />
            </IconButton>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {isLoading ? (
            <Box>
              <Skeleton variant="text" height={40} />
              <Divider />
              <Skeleton variant="text" height={40} />
              <Divider />
              <Skeleton variant="text" height={40} />
            </Box>
          ) : clients.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              No active clients found. Switch to the <strong>Client Onboarding</strong> tab to invite clients.
            </Alert>
          ) : (
            <Box>
              {clients.map((client, i) => (
                <Box key={client.address}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" py={2}>
                    <Box>
                      <Typography variant="body2" fontWeight={500} fontFamily="monospace" sx={{ fontSize: '0.95rem' }}>
                        {shortenAddress(client.address)}
                      </Typography>
                      <Chip
                        size="small"
                        label={client.walletType === 'safe' ? 'Safe' : 'Smart Account'}
                        color={client.walletType === 'safe' ? 'info' : 'warning'}
                        variant="outlined"
                        sx={{ mt: 0.5, height: 20, fontSize: '0.7rem' }}
                      />
                    </Box>
                    <Box textAlign="right">
                      <Typography variant="body1" fontWeight={600} color="text.primary">
                        {formatUSD(client.totalValue)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {parseFloat(client.usdcBalance).toFixed(2)} USDC + {parseFloat(client.wethBalance).toFixed(6)}{' '}
                        WETH
                      </Typography>
                    </Box>
                  </Box>
                  {i < clients.length - 1 && <Divider />}
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      </CustomTabPanel>

      {/* Tab 2: Client Onboarding */}
      <CustomTabPanel value={tabValue} index={1}>
        <OnboardingLinks />
      </CustomTabPanel>
    </Box>
  )
}
