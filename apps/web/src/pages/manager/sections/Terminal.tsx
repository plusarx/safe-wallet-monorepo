import { useState } from 'react'
import { Box, Tabs, Tab, Paper } from '@mui/material'
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart'
import SwapHoriz from '@mui/icons-material/SwapHoriz'
import { useManagerClients } from '@/hooks/manager/useManagerClients'
import useWallet from '@/hooks/wallets/useWallet'

import SpotTrading from './SpotTrading'

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
      id={`terminal-tabpanel-${index}`}
      aria-labelledby={`terminal-tab-${index}`}
      style={{ height: '100%', flex: 1, display: value === index ? 'flex' : 'none', flexDirection: 'column' }}
      {...other}
    >
      {value === index && <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>{children}</Box>}
    </div>
  )
}

function a11yProps(index: number) {
  return {
    id: `terminal-tab-${index}`,
    'aria-controls': `terminal-tabpanel-${index}`,
  }
}

export default function Terminal() {
  const [value, setValue] = useState(0)

  const wallet = useWallet()
  const walletAddress = wallet?.address || ''

  // Lifted Client State
  const {
    clients,
    isLoading: isLoadingClients,
    refresh: refreshClients,
    toggleClient,
    toggleSelectAll,
  } = useManagerClients(walletAddress)

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue)
  }

  // Derived selected clients to pass down
  const selectedClients = clients.filter((c) => c.selected)

  return (
    <Box sx={{ width: '100%', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Tabs */}
      <Paper sx={{ mb: 0, bgcolor: 'var(--color-background-paper)', borderRadius: 2, flexShrink: 0 }}>
        <Tabs
          value={value}
          onChange={handleChange}
          aria-label="terminal tabs"
          sx={{
            px: 2,
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '1rem',
              minHeight: 56,
            },
          }}
        >
          <Tab icon={<SwapHoriz />} iconPosition="start" label="Spot" {...a11yProps(0)} />
          <Tab icon={<CandlestickChartIcon />} iconPosition="start" label="Perps" {...a11yProps(1)} />
        </Tabs>
      </Paper>

      {/* Main Content Area */}
      <Box sx={{ flex: 1, overflow: 'hidden', mt: 2 }}>
        <CustomTabPanel value={value} index={0}>
          <SpotTrading
            clients={clients}
            isLoadingClients={isLoadingClients}
            toggleClient={toggleClient}
            toggleSelectAll={toggleSelectAll}
            refreshClients={refreshClients}
            selectedClients={selectedClients}
          />
        </CustomTabPanel>

        <CustomTabPanel value={value} index={1}>
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>Perps Coming Soon</Box>
        </CustomTabPanel>
      </Box>
    </Box>
  )
}
