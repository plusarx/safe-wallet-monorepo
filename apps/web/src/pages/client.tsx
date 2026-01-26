'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import useWallet from '@/hooks/wallets/useWallet'
import { useWalletRestoration } from '@/hooks/useWalletRestoration'
import {
  Container,
  Typography,
  Paper,
  Box,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
} from '@mui/material'
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser'
import SecurityIcon from '@mui/icons-material/Security'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import SettingsIcon from '@mui/icons-material/Settings'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import ReceiptIcon from '@mui/icons-material/Receipt'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import { useDelegationModule, PERMISSION } from '../hooks/useDelegationModule'

// Invoice utilities
import { getPendingInvoicesForClient, updateInvoiceStatus } from '@/utils/invoiceStorage'
import type { Invoice } from '@/utils/invoiceTypes'

interface ManagerDelegation {
  address: string
  name: string
  feeRate: string
  permissions: number
  delegatedAt: Date
  isActive: boolean
}

export default function ClientDashboard() {
  const router = useRouter()
  const wallet = useWallet()
  const walletAddress = wallet?.address || ''
  const isRestoring = useWalletRestoration(walletAddress)
  const [delegations, setDelegations] = useState<ManagerDelegation[]>([])
  const [isLoadingDelegations, setIsLoadingDelegations] = useState(false)

  // Invoice state
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([])
  const [processingInvoiceId, setProcessingInvoiceId] = useState<string | null>(null)
  const [invoiceMessage, setInvoiceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { isLoading, error, getManager, getDelegation, getClientManagers, revokeDelegation } = useDelegationModule()

  const loadDelegations = useCallback(async () => {
    if (!walletAddress) return

    setIsLoadingDelegations(true)
    try {
      const managers = await getClientManagers(walletAddress)
      const delegationList: ManagerDelegation[] = []

      for (const managerAddr of managers) {
        const [delegation, manager] = await Promise.all([
          getDelegation(walletAddress, managerAddr),
          getManager(managerAddr),
        ])

        if (delegation && manager) {
          delegationList.push({
            address: managerAddr,
            name: manager.name,
            feeRate: `${Number(manager.feeRate) / 100}%`,
            permissions: delegation.permissions,
            delegatedAt: new Date(Number(delegation.delegatedAt) * 1000),
            isActive: delegation.isActive,
          })
        }
      }

      setDelegations(delegationList)
    } catch (err) {
      console.error('Failed to load delegations:', err)
    } finally {
      setIsLoadingDelegations(false)
    }
  }, [walletAddress, getClientManagers, getDelegation, getManager])

  // Load pending invoices
  const loadInvoices = useCallback(() => {
    if (!walletAddress) return
    const invoices = getPendingInvoicesForClient(walletAddress)
    setPendingInvoices(invoices)
  }, [walletAddress])

  useEffect(() => {
    if (walletAddress) {
      loadDelegations()
      loadInvoices()
    }
  }, [walletAddress, loadDelegations, loadInvoices])

  const handleRevoke = async (managerAddress: string) => {
    if (!confirm('Are you sure you want to revoke this delegation?')) return

    try {
      await revokeDelegation(managerAddress)
      await loadDelegations()
    } catch (err) {
      console.error('Failed to revoke:', err)
    }
  }

  const handleApproveInvoice = async (invoiceId: string) => {
    setProcessingInvoiceId(invoiceId)
    setInvoiceMessage(null)

    try {
      const success = updateInvoiceStatus(invoiceId, 'approved')
      if (success) {
        setInvoiceMessage({ type: 'success', text: 'Invoice approved!' })
        loadInvoices()
      } else {
        setInvoiceMessage({ type: 'error', text: 'Failed to approve invoice' })
      }
    } catch (err) {
      console.error('Failed to approve invoice:', err)
      setInvoiceMessage({ type: 'error', text: 'Failed to approve invoice' })
    } finally {
      setProcessingInvoiceId(null)
      setTimeout(() => setInvoiceMessage(null), 3000)
    }
  }

  const handleRejectInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to reject this invoice?')) return

    setProcessingInvoiceId(invoiceId)
    setInvoiceMessage(null)

    try {
      const success = updateInvoiceStatus(invoiceId, 'rejected')
      if (success) {
        setInvoiceMessage({ type: 'success', text: 'Invoice rejected' })
        loadInvoices()
      } else {
        setInvoiceMessage({ type: 'error', text: 'Failed to reject invoice' })
      }
    } catch (err) {
      console.error('Failed to reject invoice:', err)
      setInvoiceMessage({ type: 'error', text: 'Failed to reject invoice' })
    } finally {
      setProcessingInvoiceId(null)
      setTimeout(() => setInvoiceMessage(null), 3000)
    }
  }

  const getPermissionLabels = (permissions: number): string[] => {
    const labels: string[] = []
    if (permissions & PERMISSION.TRADE) labels.push('Trade')
    if (permissions & PERMISSION.REBALANCE) labels.push('Rebalance')
    if (permissions & PERMISSION.YIELD) labels.push('Yield')
    return labels
  }

  const formatUSD = (value: number) =>
    value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

  useEffect(() => {
    if (!isRestoring && !walletAddress) {
      router.push('/')
    }
  }, [walletAddress, isRestoring, router])

  if (isRestoring || !walletAddress) {
    return null
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Client Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {walletAddress.substring(0, 6)}...{walletAddress.substring(38)}
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              loadDelegations()
              loadInvoices()
            }}
            disabled={isLoadingDelegations}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <VerifiedUserIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    {delegations.filter((d) => d.isActive).length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Managers
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <SecurityIcon sx={{ fontSize: 40, color: 'success.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    Secured
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Funds Protected
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <TrendingUpIcon sx={{ fontSize: 40, color: 'info.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    --
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total PnL
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Pending Invoices Section */}
      {pendingInvoices.length > 0 && (
        <Paper sx={{ p: 3, mb: 4 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <ReceiptIcon color="warning" />
              <Typography variant="h6" fontWeight={600}>
                Pending Invoices ({pendingInvoices.length})
              </Typography>
            </Box>
            <IconButton size="small" onClick={loadInvoices}>
              <RefreshIcon />
            </IconButton>
          </Box>

          {invoiceMessage && (
            <Alert severity={invoiceMessage.type} sx={{ mb: 2 }}>
              {invoiceMessage.text}
            </Alert>
          )}

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Manager</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <Box>
                        <Typography fontWeight={500}>{invoice.managerName || 'Manager'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {invoice.managerAddress.substring(0, 8)}...
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={600} color="primary.main">
                        {formatUSD(invoice.amount)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {invoice.description || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>{new Date(invoice.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell align="right">
                      <Box display="flex" gap={0.5} justifyContent="flex-end">
                        <Tooltip title="Approve">
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => handleApproveInvoice(invoice.id)}
                            disabled={processingInvoiceId === invoice.id}
                          >
                            {processingInvoiceId === invoice.id ? <CircularProgress size={18} /> : <CheckCircleIcon />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reject">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRejectInvoice(invoice.id)}
                            disabled={processingInvoiceId === invoice.id}
                          >
                            <CancelIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Delegated Managers */}
      <Paper sx={{ p: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h6" fontWeight={600}>
            Delegated Managers
          </Typography>
        </Box>

        {isLoadingDelegations ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : delegations.length === 0 ? (
          <Alert severity="info">You haven&apos;t delegated to any managers yet.</Alert>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Manager</TableCell>
                  <TableCell>Fee Rate</TableCell>
                  <TableCell>Permissions</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Delegated</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {delegations.map((delegation) => (
                  <TableRow key={delegation.address}>
                    <TableCell>
                      <Box>
                        <Typography fontWeight={600}>{delegation.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {delegation.address.substring(0, 10)}...
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{delegation.feeRate}</TableCell>
                    <TableCell>
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        {getPermissionLabels(delegation.permissions).map((label) => (
                          <Chip key={label} label={label} size="small" variant="outlined" />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={delegation.isActive ? 'Active' : 'Revoked'}
                        color={delegation.isActive ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{delegation.delegatedAt.toLocaleDateString()}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Settings">
                        <IconButton size="small">
                          <SettingsIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Revoke">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRevoke(delegation.address)}
                          disabled={isLoading || !delegation.isActive}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      {/* Footer */}
      <Typography
        variant="body2"
        sx={{
          textAlign: 'center',
          color: 'text.secondary',
          py: 4,
          mt: 4,
        }}
      >
        © 2025 PulsarX. All rights reserved.
      </Typography>
    </Container>
  )
}
