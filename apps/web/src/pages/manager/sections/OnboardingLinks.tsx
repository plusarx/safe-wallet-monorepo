'use client'

import { useState, useEffect } from 'react'
import { BrowserProvider } from 'ethers'
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Chip,
  Alert,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LinkIcon from '@mui/icons-material/Link'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import PeopleIcon from '@mui/icons-material/People'
import RefreshIcon from '@mui/icons-material/Refresh'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { useDelegationModule, PERMISSION } from '../../../hooks/useDelegationModule'
import useWallet from '@/hooks/wallets/useWallet'

type OnboardingType = 'multisig' | 'eoa'

type GeneratedLink = {
  id: string
  type: OnboardingType
  link: string
  createdAt: Date
  label?: string
  used: boolean // One-time use tracking
  usedBy?: string // Address that used this link
  usedAt?: Date // When the link was used
}

// LocalStorage key for persisting links
const LINKS_STORAGE_KEY = 'pulsarx_onboarding_links'

// Helper to load links from localStorage
const loadLinksFromStorage = (managerAddress: string): GeneratedLink[] => {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(`${LINKS_STORAGE_KEY}_${managerAddress}`)
    if (!stored) return []
    const links = JSON.parse(stored)
    // Convert date strings back to Date objects
    return links.map((link: any) => ({
      ...link,
      createdAt: new Date(link.createdAt),
      usedAt: link.usedAt ? new Date(link.usedAt) : undefined,
    }))
  } catch {
    return []
  }
}

// Helper to save links to localStorage
const saveLinksToStorage = (managerAddress: string, links: GeneratedLink[]) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${LINKS_STORAGE_KEY}_${managerAddress}`, JSON.stringify(links))
}

interface ClientInfo {
  address: string
  permissions: number
  delegatedAt: Date
  isActive: boolean
  walletType: 'eoa' | 'safe'
}

export default function OnboardingLinks() {
  // Use Safe's wallet hook
  const wallet = useWallet()
  const managerAddress = wallet?.address || ''

  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([])
  const [linkLabel, setLinkLabel] = useState('')
  const [selectedType, setSelectedType] = useState<OnboardingType>('multisig')
  const [copied, setCopied] = useState<string | null>(null)
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [isLoadingClients, setIsLoadingClients] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [managerInfo, setManagerInfo] = useState<{ name: string; feeRate: string } | null>(null)

  const { getManager, getDelegation, getManagerClients } = useDelegationModule()

  const loadManagerInfo = async () => {
    if (!managerAddress) return

    try {
      const info = await getManager(managerAddress)
      if (info && info.managerAddress !== '0x0000000000000000000000000000000000000000') {
        setIsRegistered(true)
        setManagerInfo({
          name: info.name,
          feeRate: `${Number(info.feeRate) / 100}%`,
        })
      } else {
        setIsRegistered(false)
        setManagerInfo(null)
      }
    } catch (err) {
      console.error('Failed to load manager info:', err)
      setIsRegistered(false)
    }
  }

  const loadClients = async () => {
    if (!managerAddress) return

    setIsLoadingClients(true)
    try {
      const provider = new BrowserProvider(window.ethereum as any)
      const clientAddresses = await getManagerClients(managerAddress)
      const clientList: ClientInfo[] = []

      for (const clientAddr of clientAddresses) {
        const delegation = await getDelegation(clientAddr, managerAddress)
        if (delegation) {
          // Check if address is a contract (Safe) or EOA
          const code = await provider.getCode(clientAddr)
          const walletType = code && code !== '0x' ? 'safe' : 'eoa'

          clientList.push({
            address: clientAddr,
            permissions: delegation.permissions,
            delegatedAt: new Date(Number(delegation.delegatedAt) * 1000),
            isActive: delegation.isActive,
            walletType,
          })
        }
      }

      setClients(clientList)
    } catch (err) {
      console.error('Failed to load clients:', err)
    } finally {
      setIsLoadingClients(false)
    }
  }

  useEffect(() => {
    if (managerAddress) {
      loadManagerInfo()
      loadClients()
      // Load previously generated links
      const storedLinks = loadLinksFromStorage(managerAddress)
      setGeneratedLinks(storedLinks)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerAddress, wallet])

  const generateLink = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    // Generate a unique, cryptographically random ID for one-time use
    const linkId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    const link = `${baseUrl}/onboard?manager=${managerAddress}&type=${selectedType}&ref=${linkId}`

    const newLink: GeneratedLink = {
      id: linkId,
      type: selectedType,
      link,
      createdAt: new Date(),
      label: linkLabel || undefined,
      used: false, // New link is not used yet
    }

    const updatedLinks = [newLink, ...generatedLinks]
    setGeneratedLinks(updatedLinks)
    saveLinksToStorage(managerAddress, updatedLinks)
    setLinkLabel('')
  }

  // Mark a link as used (called when client successfully onboards)

  // Check onboarded clients against generated links and mark as used
  useEffect(() => {
    if (clients.length === 0 || generatedLinks.length === 0) return

    // For each client, check if their onboarding matches any link
    // This is a simple heuristic - in production you'd verify with on-chain data
    let hasUpdates = false
    const updatedLinks = generatedLinks.map((link) => {
      if (link.used) return link

      // Check if any client was added after this link was created
      // and the link hasn't been used yet
      const matchingClient = clients.find((client) => {
        const clientTime = client.delegatedAt.getTime()
        const linkTime = link.createdAt.getTime()
        // Client onboarded after link was created and within 7 days
        return clientTime > linkTime && clientTime < linkTime + 7 * 24 * 60 * 60 * 1000
      })

      if (matchingClient && !link.used) {
        hasUpdates = true
        return { ...link, used: true, usedBy: matchingClient.address, usedAt: matchingClient.delegatedAt }
      }
      return link
    })

    if (hasUpdates) {
      setGeneratedLinks(updatedLinks)
      saveLinksToStorage(managerAddress, updatedLinks)
    }
  }, [clients, generatedLinks, managerAddress])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const getPermissionLabels = (permissions: number): string[] => {
    const labels: string[] = []
    if (permissions & PERMISSION.TRADE) labels.push('Trade')
    if (permissions & PERMISSION.REBALANCE) labels.push('Rebalance')
    if (permissions & PERMISSION.YIELD) labels.push('Yield')
    return labels
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>
        Client Onboarding
      </Typography>

      <Grid container spacing={3}>
        {/* Left Column - Link Generator */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>
              Generate Client Onboarding Link
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Create a link for clients to onboard in 3 clicks.
            </Typography>

            {/* Manager Status */}
            <Alert
              severity={isRegistered ? 'success' : 'warning'}
              sx={{ mb: 2 }}
              icon={isRegistered ? <CheckCircleIcon /> : undefined}
            >
              {isRegistered ? (
                <>
                  <strong>Hi {managerInfo?.name}!</strong>
                </>
              ) : (
                'You are not registered as a manager yet. Register first via the contract.'
              )}
            </Alert>

            <TextField fullWidth label="Manager Address" value={managerAddress} size="small" disabled sx={{ mb: 2 }} />

            <TextField
              fullWidth
              label="Link Label (optional)"
              placeholder="e.g., Q1 2026 Clients"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              size="small"
              sx={{ mb: 3 }}
            />

            <Typography variant="subtitle2" mb={1}>
              Client Wallet Type
            </Typography>
            <Box display="flex" gap={1} mb={3}>
              <Chip
                label="Multisig Safe"
                variant={selectedType === 'multisig' ? 'filled' : 'outlined'}
                color={selectedType === 'multisig' ? 'primary' : 'default'}
                onClick={() => setSelectedType('multisig')}
                icon={<AccountBalanceWalletIcon />}
              />
              {/* <Chip
                label="EOA (EIP-7702)"
                variant={selectedType === 'eoa' ? 'filled' : 'outlined'}
                color={selectedType === 'eoa' ? 'primary' : 'default'}
                onClick={() => setSelectedType('eoa')}
              /> */}
            </Box>

            <Button
              fullWidth
              variant="contained"
              startIcon={<LinkIcon />}
              onClick={generateLink}
              disabled={!isRegistered}
            >
              Generate Onboarding Link
            </Button>
          </Paper>

          {/* Generated Links List */}
          {generatedLinks.length > 0 && (
            <Paper sx={{ p: 3, mt: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>
                Generated Links ({generatedLinks.length})
              </Typography>
              {generatedLinks.map((link) => (
                <Card
                  key={link.id}
                  variant="outlined"
                  sx={{
                    mb: 1,
                    bgcolor: link.used ? 'action.hover' : 'inherit',
                    opacity: link.used ? 0.7 : 1,
                  }}
                >
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            sx={{ textDecoration: link.used ? 'line-through' : 'none' }}
                          >
                            {link.label || `Link ${link.id}`}
                          </Typography>
                          {link.used && (
                            <Chip
                              label="Used"
                              size="small"
                              color="default"
                              variant="outlined"
                              sx={{ height: 20, fontSize: 10 }}
                            />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {link.type === 'multisig' ? 'Multisig Safe' : 'EOA (EIP-7702)'}
                          {link.used && link.usedBy && ` • Used by ${link.usedBy.substring(0, 6)}...`}
                        </Typography>
                      </Box>
                      <Tooltip title={link.used ? 'Link already used' : copied === link.id ? 'Copied!' : 'Copy link'}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => !link.used && copyToClipboard(link.link, link.id)}
                            color={copied === link.id ? 'success' : 'default'}
                            disabled={link.used}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Paper>
          )}
        </Grid>

        {/* Right Column - Client List */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Box display="flex" alignItems="center" gap={1}>
                <PeopleIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>
                  Your Clients ({clients.filter((c) => c.isActive).length})
                </Typography>
              </Box>
              <IconButton size="small" onClick={loadClients} disabled={isLoadingClients || !managerAddress}>
                <RefreshIcon />
              </IconButton>
            </Box>

            {isLoadingClients ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : clients.length === 0 ? (
              <Alert severity="info">No clients yet. Share your onboarding link to get started!</Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Client Address</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Permissions</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.address}>
                        <TableCell>
                          <Typography variant="body2" fontFamily="monospace">
                            {client.address.substring(0, 8)}...{client.address.substring(36)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={client.walletType.toUpperCase()}
                            size="small"
                            color={client.walletType === 'safe' ? 'info' : 'warning'}
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box display="flex" gap={0.5} flexWrap="wrap">
                            {getPermissionLabels(client.permissions).map((label) => (
                              <Chip
                                key={label}
                                label={label}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: '0.7rem' }}
                              />
                            ))}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={client.isActive ? 'Active' : 'Revoked'}
                            color={client.isActive ? 'success' : 'error'}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
