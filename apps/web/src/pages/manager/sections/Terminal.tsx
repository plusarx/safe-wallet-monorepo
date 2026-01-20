import { useState } from 'react'
import { Box, Tabs, Tab, Paper } from '@mui/material'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import TimelineIcon from '@mui/icons-material/Timeline'

// Import the existing functional components
import TradingTerminal from './TradingTerminal'
import OrderTypes from './OrderTypes'

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
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
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

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue)
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* Sub-tabs Navigation */}
      <Paper sx={{ mb: 0, bgcolor: 'var(--color-background-paper)', borderRadius: 2 }}>
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
              minHeight: 64,
            },
          }}
        >
          <Tab icon={<ShowChartIcon />} iconPosition="start" label="Swap" {...a11yProps(0)} />
          <Tab icon={<TimelineIcon />} iconPosition="start" label="Limit / Stop" {...a11yProps(1)} />
        </Tabs>
      </Paper>

      {/* Tab Panels */}
      <CustomTabPanel value={value} index={0}>
        <TradingTerminal />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={1}>
        <OrderTypes />
      </CustomTabPanel>
    </Box>
  )
}
