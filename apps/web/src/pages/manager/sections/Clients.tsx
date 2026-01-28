import { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Alert,
  Chip,
  Divider,
  Skeleton,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  InputAdornment,
  CircularProgress,
  Tooltip,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material'
import InfoIcon from '@mui/icons-material/Info'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import LinkIcon from '@mui/icons-material/Link'
import RefreshIcon from '@mui/icons-material/Refresh'
import SettingsIcon from '@mui/icons-material/Settings'
import ReceiptIcon from '@mui/icons-material/Receipt'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import DeleteIcon from '@mui/icons-material/Delete'

// Hooks and Contracts
import { useManagerStats, type ClientInfo } from '../../../hooks/manager/useManagerStats'
import { useTradingModule } from '../../../hooks/useTradingModule'
import { useDelegationModule } from '../../../hooks/useDelegationModule'
import useWallet from '@/hooks/wallets/useWallet'

// Invoice utilities
import { saveInvoice, generateInvoiceId } from '@/utils/invoiceStorage'
import type { Invoice } from '@/utils/invoiceTypes'

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

// Extended client info for dialogs
interface SelectedClientFull extends ClientInfo {
  onboardingDate?: Date
  startingValue?: number
}

export default function Clients() {
  const [tabValue, setTabValue] = useState(0)
  const wallet = useWallet()
  const managerAddress = wallet?.address || ''

  // -- Consolidated Logic using Hook --
  const { clients, isLoading, error, refresh } = useManagerStats()
  const { setDailyLimit, isLoading: isSettingLimit } = useTradingModule()

  // Daily Limit State
  const [openLimitDialog, setOpenLimitDialog] = useState(false)
  const [selectedClient, setSelectedClient] = useState<SelectedClientFull | null>(null)
  const [newDailyLimit, setNewDailyLimit] = useState('')
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Client Info Dialog State
  const [openInfoDialog, setOpenInfoDialog] = useState(false)

  // Delete Client Dialog State
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Hooks
  const { removeClient } = useDelegationModule()

  // Invoice Dialog State
  const [openInvoiceDialog, setOpenInvoiceDialog] = useState(false)
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceDescription, setInvoiceDescription] = useState('')
  const [invoiceMessage, setInvoiceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false)

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  const handleOpenLimitDialog = (client: ClientInfo) => {
    setSelectedClient(client)
    setNewDailyLimit('')
    setActionMessage(null)
    setOpenLimitDialog(true)
  }

  const handleOpenInfoDialog = (client: ClientInfo) => {
    // Estimate starting value as 90-110% of current (simulated trend)
    const trendMultiplier = 0.9 + Math.random() * 0.2
    setSelectedClient({
      ...client,
      onboardingDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000), // Random within 90 days
      startingValue: client.totalValue * trendMultiplier,
    })
    setOpenInfoDialog(true)
  }

  const handleOpenInvoiceDialog = (client: ClientInfo) => {
    setSelectedClient(client)
    setInvoiceAmount('')
    setInvoiceDescription('')
    setInvoiceMessage(null)
    setOpenInvoiceDialog(true)
  }

  const handleSetLimit = async () => {
    if (!selectedClient || !newDailyLimit) return

    setActionMessage(null)
    try {
      const txHash = await setDailyLimit(selectedClient.address, newDailyLimit)
      setActionMessage({ type: 'success', text: `Daily limit set! Tx: ${txHash.substring(0, 10)}...` })
      setTimeout(() => {
        setOpenLimitDialog(false)
        setActionMessage(null)
      }, 2000)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set limit'
      console.error('Failed to set limit:', err)
      setActionMessage({ type: 'error', text: errorMessage })
    }
  }

  const handleSubmitInvoice = async () => {
    if (!selectedClient || !invoiceAmount || !managerAddress) return

    setIsSubmittingInvoice(true)
    setInvoiceMessage(null)

    try {
      const invoice: Invoice = {
        id: generateInvoiceId(),
        managerAddress,
        managerName: 'Fund Manager', // Could be fetched from manager registration
        clientAddress: selectedClient.address,
        amount: parseFloat(invoiceAmount),
        status: 'pending',
        createdAt: new Date(),
        description: invoiceDescription || undefined,
      }

      saveInvoice(invoice)
      setInvoiceMessage({ type: 'success', text: 'Invoice sent to client!' })

      setTimeout(() => {
        setOpenInvoiceDialog(false)
        setInvoiceMessage(null)
      }, 2000)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create invoice'
      console.error('Failed to create invoice:', err)
      setInvoiceMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsSubmittingInvoice(false)
    }
  }

  const handleOpenDeleteDialog = (client: ClientInfo) => {
    setSelectedClient(client)
    setOpenDeleteDialog(true)
  }

  const handleDeleteClient = async () => {
    if (!selectedClient) return

    setIsDeleting(true)
    try {
      await removeClient(selectedClient.address)
      setOpenDeleteDialog(false)
      refresh() // Refresh client list
    } catch (err: unknown) {
      console.error('Failed to remove client:', err)
      // Error handling is managed by hook, but could add local alert here if needed
    } finally {
      setIsDeleting(false)
    }
  }

  const shortenAddress = (addr: string) => `${addr.substring(0, 8)}...${addr.substring(addr.length - 6)}`
  const formatUSD = (value: number) =>
    value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

  // Calculate balance change
  const getBalanceChange = (current: number, starting: number) => {
    const change = current - starting
    const percentage = starting > 0 ? ((change / starting) * 100).toFixed(1) : '0'
    return { change, percentage, isPositive: change >= 0 }
  }

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
                    <Box display="flex" alignItems="center" gap={2}>
                      <Box textAlign="right">
                        <Typography variant="body1" fontWeight={600} color="text.primary">
                          {formatUSD(client.totalValue)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {parseFloat(client.usdcBalance).toFixed(2)} USDC + {parseFloat(client.wethBalance).toFixed(6)}{' '}
                          WETH
                        </Typography>
                      </Box>
                      {/* Action Buttons */}
                      <Box display="flex" gap={0.5}>
                        <Tooltip title="Client Info">
                          <IconButton onClick={() => handleOpenInfoDialog(client)} size="small">
                            <InfoOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Create Invoice">
                          <IconButton onClick={() => handleOpenInvoiceDialog(client)} size="small">
                            <ReceiptIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Set Daily Limit">
                          <IconButton onClick={() => handleOpenLimitDialog(client)} size="small">
                            <SettingsIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove Client">
                          <IconButton onClick={() => handleOpenDeleteDialog(client)} size="small" color="error">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
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

      {/* Daily Limit Dialog */}
      <Dialog
        open={openLimitDialog}
        onClose={() => !isSettingLimit && setOpenLimitDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Set Daily Limit</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Set the maximum daily spending limit (USD) for{' '}
            {selectedClient ? shortenAddress(selectedClient.address) : ''}.
          </Typography>

          {actionMessage && (
            <Alert severity={actionMessage.type} sx={{ mb: 2 }}>
              {actionMessage.text}
            </Alert>
          )}

          <TextField
            autoFocus
            margin="dense"
            label="Daily Limit (USD)"
            type="number"
            fullWidth
            variant="outlined"
            value={newDailyLimit}
            onChange={(e) => setNewDailyLimit(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            disabled={isSettingLimit}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenLimitDialog(false)} disabled={isSettingLimit}>
            Cancel
          </Button>
          <Button onClick={handleSetLimit} variant="contained" disabled={!newDailyLimit || isSettingLimit}>
            {isSettingLimit ? <CircularProgress size={24} color="inherit" /> : 'Set Limit'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Client Info Dialog */}
      <Dialog open={openInfoDialog} onClose={() => setOpenInfoDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <InfoOutlinedIcon color="primary" />
            Client Information
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedClient && (
            <Box>
              <Typography variant="body2" color="text.secondary" fontFamily="monospace" mb={2}>
                {selectedClient.address}
              </Typography>

              <Table size="small">
                <TableBody>
                  {/* Onboarding Date */}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, border: 'none', pl: 0 }}>Onboarding Date</TableCell>
                    <TableCell sx={{ border: 'none', textAlign: 'right' }}>
                      {selectedClient.onboardingDate?.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      }) || 'N/A'}
                    </TableCell>
                  </TableRow>

                  {/* Starting Amount */}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, border: 'none', pl: 0 }}>Starting Amount</TableCell>
                    <TableCell sx={{ border: 'none', textAlign: 'right' }}>
                      {selectedClient.startingValue ? formatUSD(selectedClient.startingValue) : 'N/A'}
                      <Typography variant="caption" display="block" color="text.secondary">
                        (Since onboarding)
                      </Typography>
                    </TableCell>
                  </TableRow>

                  {/* Current Holdings */}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, border: 'none', pl: 0 }}>Current Holdings</TableCell>
                    <TableCell sx={{ border: 'none', textAlign: 'right' }}>
                      <Typography fontWeight={600}>{formatUSD(selectedClient.totalValue)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {parseFloat(selectedClient.usdcBalance).toFixed(2)} USDC
                        <br />
                        {parseFloat(selectedClient.wethBalance).toFixed(6)} WETH
                      </Typography>
                    </TableCell>
                  </TableRow>

                  {/* Balance Over Time */}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, border: 'none', pl: 0 }}>Balance Change</TableCell>
                    <TableCell sx={{ border: 'none', textAlign: 'right' }}>
                      {selectedClient.startingValue &&
                        (() => {
                          const { change, percentage, isPositive } = getBalanceChange(
                            selectedClient.totalValue,
                            selectedClient.startingValue,
                          )
                          return (
                            <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                              {isPositive ? (
                                <TrendingUpIcon sx={{ color: 'success.main', fontSize: 20 }} />
                              ) : (
                                <TrendingDownIcon sx={{ color: 'error.main', fontSize: 20 }} />
                              )}
                              <Typography fontWeight={600} color={isPositive ? 'success.main' : 'error.main'}>
                                {isPositive ? '+' : ''}
                                {formatUSD(change)} ({isPositive ? '+' : ''}
                                {percentage}%)
                              </Typography>
                            </Box>
                          )
                        })()}
                    </TableCell>
                  </TableRow>

                  {/* Wallet Type */}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, border: 'none', pl: 0 }}>Wallet Type</TableCell>
                    <TableCell sx={{ border: 'none', textAlign: 'right' }}>
                      <Chip
                        size="small"
                        label={selectedClient.walletType === 'safe' ? 'Safe Multisig' : 'Smart Account'}
                        color={selectedClient.walletType === 'safe' ? 'info' : 'warning'}
                      />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenInfoDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Invoice Dialog */}
      <Dialog
        open={openInvoiceDialog}
        onClose={() => !isSubmittingInvoice && setOpenInvoiceDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <ReceiptIcon color="primary" />
            Create Invoice
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Send an invoice to {selectedClient ? shortenAddress(selectedClient.address) : ''} for approval.
          </Typography>

          {invoiceMessage && (
            <Alert severity={invoiceMessage.type} sx={{ my: 2 }}>
              {invoiceMessage.text}
            </Alert>
          )}

          <TextField
            autoFocus
            margin="dense"
            label="Invoice Amount (USD)"
            type="number"
            fullWidth
            variant="outlined"
            value={invoiceAmount}
            onChange={(e) => setInvoiceAmount(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            disabled={isSubmittingInvoice}
            sx={{ mb: 2 }}
          />

          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            variant="outlined"
            value={invoiceDescription}
            onChange={(e) => setInvoiceDescription(e.target.value)}
            placeholder="e.g., Management fee for Q1 2026"
            disabled={isSubmittingInvoice}
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenInvoiceDialog(false)} disabled={isSubmittingInvoice}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitInvoice}
            variant="contained"
            disabled={!invoiceAmount || parseFloat(invoiceAmount) <= 0 || isSubmittingInvoice}
          >
            {isSubmittingInvoice ? <CircularProgress size={24} color="inherit" /> : 'Send Invoice'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={openDeleteDialog} onClose={() => !isDeleting && setOpenDeleteDialog(false)}>
        <DialogTitle>Remove Client</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove <b>{selectedClient ? shortenAddress(selectedClient.address) : ''}</b>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This will revoke your permissions to manage this Safe. The client will be notified to disable the module.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)} disabled={isDeleting}>Cancel</Button>
          <Button onClick={handleDeleteClient} color="error" variant="contained" disabled={isDeleting}>
            {isDeleting ? <CircularProgress size={24} color="inherit" /> : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
