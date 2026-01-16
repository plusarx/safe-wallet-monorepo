'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { BrowserProvider } from 'ethers'
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
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser'
import SecurityIcon from '@mui/icons-material/Security'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import SettingsIcon from '@mui/icons-material/Settings'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { useDelegationModule, DELEGATION_MODULE_ADDRESS, PERMISSION } from '../hooks/useDelegationModule'

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
    const [walletAddress, setWalletAddress] = useState<string>('')
    const [isConnecting, setIsConnecting] = useState(false)
    const [delegations, setDelegations] = useState<ManagerDelegation[]>([])
    const [isLoadingDelegations, setIsLoadingDelegations] = useState(false)

    const {
        isLoading,
        error,
        getManager,
        getDelegation,
        getClientManagers,
        revokeDelegation,
    } = useDelegationModule()

    const connectWallet = async () => {
        if (typeof window === 'undefined' || !window.ethereum) {
            alert('Please install MetaMask')
            return
        }

        setIsConnecting(true)
        try {
            const provider = new BrowserProvider(window.ethereum as any)
            const accounts = await provider.send('eth_requestAccounts', [])
            if (accounts.length > 0) {
                setWalletAddress(accounts[0])
            }
        } catch (err) {
            console.error('Failed to connect:', err)
        } finally {
            setIsConnecting(false)
        }
    }

    const loadDelegations = async () => {
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
    }

    useEffect(() => {
        if (walletAddress) {
            loadDelegations()
        }
    }, [walletAddress])

    const handleRevoke = async (managerAddress: string) => {
        if (!confirm('Are you sure you want to revoke this delegation?')) return

        try {
            await revokeDelegation(managerAddress)
            await loadDelegations()
        } catch (err) {
            console.error('Failed to revoke:', err)
        }
    }

    const getPermissionLabels = (permissions: number): string[] => {
        const labels: string[] = []
        if (permissions & PERMISSION.TRADE) labels.push('Trade')
        if (permissions & PERMISSION.REBALANCE) labels.push('Rebalance')
        if (permissions & PERMISSION.YIELD) labels.push('Yield')
        return labels
    }

    if (!walletAddress) {
        return (
            <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
                <Paper sx={{ p: 6 }}>
                    <AccountBalanceWalletIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                    <Typography variant="h5" fontWeight={600} gutterBottom>
                        Client Dashboard
                    </Typography>
                    <Typography variant="body1" color="text.secondary" mb={4}>
                        Connect your wallet to view your delegated managers and portfolio
                    </Typography>
                    <Button
                        variant="contained"
                        size="large"
                        onClick={connectWallet}
                        disabled={isConnecting}
                        startIcon={isConnecting ? <CircularProgress size={20} /> : <AccountBalanceWalletIcon />}
                    >
                        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                    </Button>
                </Paper>
            </Container>
        )
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
                        onClick={loadDelegations}
                        disabled={isLoadingDelegations}
                    >
                        Refresh
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => router.push('/onboard')}
                    >
                        Add Manager
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
                                        {delegations.filter(d => d.isActive).length}
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

            {/* Delegated Managers */}
            <Paper sx={{ p: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                    <Typography variant="h6" fontWeight={600}>
                        Delegated Managers
                    </Typography>
                    <Chip
                        label={`Contract: ${DELEGATION_MODULE_ADDRESS.substring(0, 10)}...`}
                        size="small"
                        onClick={() => window.open(`https://arbiscan.io/address/${DELEGATION_MODULE_ADDRESS}`, '_blank')}
                        icon={<OpenInNewIcon />}
                    />
                </Box>

                {isLoadingDelegations ? (
                    <Box display="flex" justifyContent="center" py={4}>
                        <CircularProgress />
                    </Box>
                ) : delegations.length === 0 ? (
                    <Alert severity="info">
                        You haven't delegated to any managers yet.{' '}
                        <Button size="small" onClick={() => router.push('/onboard')}>
                            Get Started
                        </Button>
                    </Alert>
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
                                        <TableCell>
                                            {delegation.delegatedAt.toLocaleDateString()}
                                        </TableCell>
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
        </Container>
    )
}
