'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { BrowserProvider, Interface } from 'ethers'
import {
    Container,
    Typography,
    Paper,
    Box,
    Button,
    Stepper,
    Step,
    StepLabel,
    StepContent,
    Alert,
    Chip,
    CircularProgress,
    Link,
    Tabs,
    Tab,
    TextField,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import SecurityIcon from '@mui/icons-material/Security'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import WarningIcon from '@mui/icons-material/Warning'
import { useDelegationModule, PERMISSION } from '../hooks/useDelegationModule'
import { DELEGATION_MODULE_ADDRESSES } from '../contracts/DelegationModule'
import { useSafeSDK } from '../hooks/useSafeSDK'
import { useEIP7702 } from '../hooks/useEIP7702'
import { TRADING_MODULE_ADDRESSES, TOKENS_BY_CHAIN, SWAP_ROUTER_ADDRESSES } from '../contracts/TradingModule'

type WalletType = 'eoa' | 'safe'

export default function ClientOnboarding() {
    const router = useRouter()
    const { manager, type } = router.query
    const managerAddress = typeof manager === 'string' ? manager : ''
    const queryType = typeof type === 'string' ? type : 'eoa'

    const [walletType, setWalletType] = useState<WalletType>(queryType as WalletType)
    const [activeStep, setActiveStep] = useState(0)
    const [isComplete, setIsComplete] = useState(false)
    const [safeAddress, setSafeAddress] = useState<string>('')
    const [managerInfo, setManagerInfo] = useState<{ name: string; feeRate: string } | null>(null)
    const [txHash, setTxHash] = useState<string>('')
    const [connectError, setConnectError] = useState<string>('')

    // Delegation Hook
    const {
        isLoading: isDelegating,
        error: delegationError,
        getManager,
        getDelegation
    } = useDelegationModule()

    // Safe SDK Hook
    const {
        isLoading: isSafeLoading,
        error: safeError,
        state: safeState,
        connectSafe,
        enableModules,
        executeContractCall,
        executeBatch: executeSafeBatch,
        disconnect
    } = useSafeSDK()

    // EIP-7702 Hook (multi-wallet support)
    const {
        isLoading: is7702Loading,
        error: error7702,
        state: state7702,
        connectEOA,
        requestSmartAccountUpgrade,
        enableModulesAndDelegate,
        getWalletSupportInfo,
        executeBatch,
        DELEGATOR_CONTRACTS,
    } = useEIP7702()

    // Get wallet support info
    const walletInfo = getWalletSupportInfo()

    // Set wallet type from query
    useEffect(() => {
        if (queryType === 'safe' || queryType === 'eoa') {
            setWalletType(queryType)
            setActiveStep(0)
            setConnectError('')
            disconnect()
        }
    }, [queryType])

    // Load manager info
    useEffect(() => {
        if (managerAddress) {
            loadManagerInfo()
        }
    }, [managerAddress])

    const loadManagerInfo = async () => {
        try {
            const info = await getManager(managerAddress)
            if (info && info.isActive) {
                setManagerInfo({
                    name: info.name,
                    feeRate: `${Number(info.feeRate) / 100}%`,
                })
            }
        } catch (err) {
            console.error('Failed to load manager info:', err)
        }
    }

    // ============ EOA FLOW (EIP-7702) ============

    // Step 1: Connect EOA wallet
    const handleConnectEOA = async () => {
        setConnectError('')
        const address = await connectEOA()
        if (address) {
            // If already delegated, skip to step 2 (enable modules)
            if (state7702.isDelegated) {
                setActiveStep(2)
            } else {
                setActiveStep(1)
            }
        } else if (error7702) {
            setConnectError(error7702)
        }
    }

    // Step 2: Upgrade to Smart Account via EIP-7702
    const handleUpgradeSmartAccount = async () => {
        const success = await requestSmartAccountUpgrade()
        if (success) {
            setActiveStep(2)
        }
    }

    // Step 3: Enable modules + approve manager
    const handleEnableAndApprove = async () => {
        if (!managerAddress) return

        const hash = await enableModulesAndDelegate(
            managerAddress as `0x${string}`,
            PERMISSION.ALL
        )
        if (hash) {
            setTxHash(hash)
            setActiveStep(3)
        }
    }

    // ============ SAFE FLOW ============

    const handleSafeConnect = async () => {
        if (!safeAddress || !safeAddress.startsWith('0x') || safeAddress.length !== 42) {
            setConnectError('Please enter a valid Safe address')
            return
        }

        const success = await connectSafe(safeAddress)
        if (success) {
            setActiveStep(1)
        }
    }

    const handleEnableModule = async () => {
        if (safeState.isModuleEnabled) {
            setActiveStep(2)
            return
        }

        const tx = await enableModules()
        if (tx) {
            setActiveStep(2)
        }
    }

    const handleSafeApprove = async () => {
        if (!managerAddress) return

        try {
            const existingDelegation = await getDelegation(safeAddress, managerAddress)
            if (existingDelegation && existingDelegation.isActive) {
                setActiveStep(3)
                return
            }

            const provider = new BrowserProvider(window.ethereum as any)
            const network = await provider.getNetwork()
            const chainId = Number(network.chainId)
            const delegationAddress = DELEGATION_MODULE_ADDRESSES[chainId]

            if (!delegationAddress) {
                alert(`Chain ${chainId} not supported`)
                return
            }

            const iface = new Interface(['function delegateToManager(address manager, uint8 permissions)'])
            const data = iface.encodeFunctionData('delegateToManager', [managerAddress, PERMISSION.ALL])

            const hash = await executeContractCall(delegationAddress, '0', data)
            if (hash) {
                setTxHash(hash)
                setActiveStep(3)
            }
        } catch (err: any) {
            if (err.message?.includes('already exists')) {
                setActiveStep(3)
            }
            console.error(err)
        }
    }

    // Step 4: Approve Tokens
    const handleApproveTokens = async () => {
        try {
            const provider = new BrowserProvider(window.ethereum as any)
            const network = await provider.getNetwork()
            const chainId = Number(network.chainId)

            const tradingModule = TRADING_MODULE_ADDRESSES[chainId]
            const swapRouter = SWAP_ROUTER_ADDRESSES[chainId]
            const tokens = TOKENS_BY_CHAIN[chainId]

            if (!tradingModule || !tokens) {
                alert(`Chain ${chainId} not supported`)
                return
            }

            const iface = new Interface(['function approve(address spender, uint256 amount)'])
            const maxUint256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935'

            const calls: { to: string; value: bigint; data: string }[] = []

            // Helper to add approval
            const addApproval = (tokenAddr: string, spender: string) => {
                if (!tokenAddr || tokenAddr === '0na') return
                calls.push({
                    to: tokenAddr,
                    value: 0n,
                    data: iface.encodeFunctionData('approve', [spender, maxUint256])
                })
            }

            // Approve TradingModule (Fees) & SwapRouter (Swaps) for all tokens
            Object.values(tokens).forEach(token => {
                if (tradingModule) addApproval(token.address, tradingModule)
                if (swapRouter) addApproval(token.address, swapRouter)
            })

            if (calls.length === 0) return

            if (walletType === 'eoa') {
                const hash = await executeBatch(calls as any)
                if (hash) {
                    setTxHash(hash)
                    setActiveStep(4)
                }
            } else {
                // Safe Flow: Batch
                await executeSafeBatch(calls.map(c => ({
                    to: c.to,
                    value: '0',
                    data: c.data
                })))
                setActiveStep(4)
            }

        } catch (err: any) {
            console.error('Approval failed:', err)
            // setConnectError(err.message)
        }
    }

    const handleConfirm = () => {
        setIsComplete(true)
    }

    // Completed view
    if (isComplete) {
        return (
            <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
                <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
                <Typography variant="h4" fontWeight={600} gutterBottom>
                    Setup Complete!
                </Typography>
                <Typography variant="body1" color="text.secondary" mb={3}>
                    {walletType === 'safe'
                        ? `Your Safe (${safeAddress.substring(0, 8)}...) is now connected to your manager.`
                        : `Your EOA is now a Smart Account and connected to your manager.`}
                </Typography>
                {txHash && txHash !== 'success' && (
                    <Alert severity="success" sx={{ mb: 3 }}>
                        <Link href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank">
                            View transaction on Etherscan <OpenInNewIcon sx={{ fontSize: 14 }} />
                        </Link>
                    </Alert>
                )}
                <Button variant="contained" onClick={() => router.push('/')}>
                    Go to Dashboard
                </Button>
            </Container>
        )
    }

    return (
        <Container maxWidth="sm" sx={{ py: 6 }}>
            <Paper sx={{ p: 4 }}>
                <Box textAlign="center" mb={3}>
                    <Typography variant="h5" fontWeight={600} gutterBottom>
                        Client Onboarding
                    </Typography>

                    <Tabs
                        value={walletType}
                        onChange={(_, v) => {
                            setWalletType(v)
                            setActiveStep(0)
                            setConnectError('')
                            if (v === 'safe') disconnect()
                        }}
                        centered
                        sx={{ mb: 2 }}
                    >
                        <Tab value="eoa" label="EOA (EIP-7702)" icon={<SmartToyIcon />} iconPosition="start" />
                        <Tab value="safe" label="Safe Wallet" icon={<SecurityIcon />} iconPosition="start" />
                    </Tabs>

                    {managerInfo && (
                        <Chip
                            icon={<VerifiedUserIcon />}
                            label={`Manager: ${managerInfo.name} (${managerInfo.feeRate} fee)`}
                            color="primary"
                            variant="outlined"
                        />
                    )}
                </Box>

                {/* ============ EOA FLOW (EIP-7702) ============ */}
                {walletType === 'eoa' && (
                    <Stepper activeStep={activeStep} orientation="vertical">
                        <Step>
                            <StepLabel>Connect Wallet</StepLabel>
                            <StepContent>
                                <Typography variant="body2" color="text.secondary" mb={2}>
                                    Connect MetaMask, Rabby, or Trust Wallet (EIP-7702 supported)
                                </Typography>

                                {/* Wallet Support Info */}
                                {state7702.isConnected && (
                                    <Alert
                                        severity={walletInfo.supported ? 'success' : 'warning'}
                                        sx={{ mb: 2 }}
                                        icon={walletInfo.supported ? undefined : <WarningIcon />}
                                    >
                                        <Typography variant="body2">
                                            <strong>{walletInfo.name}</strong>: {walletInfo.note}
                                        </Typography>
                                    </Alert>
                                )}

                                {connectError && <Alert severity="error" sx={{ mb: 2 }}>{connectError}</Alert>}
                                {error7702 && <Alert severity="error" sx={{ mb: 2 }}>{error7702}</Alert>}

                                <Button
                                    variant="contained"
                                    onClick={handleConnectEOA}
                                    disabled={is7702Loading}
                                    startIcon={is7702Loading ? <CircularProgress size={16} /> : <AccountBalanceWalletIcon />}
                                >
                                    {is7702Loading ? 'Connecting...' : 'Connect Wallet'}
                                </Button>
                            </StepContent>
                        </Step>

                        <Step>
                            <StepLabel>Upgrade to Smart Account (EIP-7702)</StepLabel>
                            <StepContent>
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    <Typography variant="body2">
                                        <strong>EIP-7702</strong> upgrades your EOA to a Smart Account
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                        • Address stays the same<br />
                                        • Enables batch transactions<br />
                                        • Allows manager to trade on your behalf
                                    </Typography>
                                </Alert>

                                {state7702.isDelegated && (
                                    <Alert severity="success" sx={{ mb: 2 }}>
                                        ✅ Already upgraded! Delegator: {state7702.delegatorType}
                                        ({state7702.delegationTarget?.substring(0, 10)}...)
                                    </Alert>
                                )}

                                {error7702 && <Alert severity="error" sx={{ mb: 2 }}>{error7702}</Alert>}

                                <Button
                                    variant="contained"
                                    onClick={state7702.isDelegated ? () => setActiveStep(2) : handleUpgradeSmartAccount}
                                    disabled={is7702Loading}
                                    startIcon={is7702Loading ? <CircularProgress size={16} /> : <SmartToyIcon />}
                                    color={state7702.isDelegated ? 'success' : 'primary'}
                                >
                                    {is7702Loading
                                        ? 'Upgrading...'
                                        : state7702.isDelegated
                                            ? 'Continue'
                                            : 'Upgrade to Smart Account'}
                                </Button>
                            </StepContent>
                        </Step>

                        <Step>
                            <StepLabel>Enable Modules & Approve Manager</StepLabel>
                            <StepContent>
                                <Typography variant="body2" mb={2}>
                                    Enable DelegationModule, TradingModule, and grant permissions to your manager.
                                </Typography>
                                {error7702 && <Alert severity="error" sx={{ mb: 2 }}>{error7702}</Alert>}
                                <Button
                                    variant="contained"
                                    onClick={handleEnableAndApprove}
                                    disabled={is7702Loading}
                                    startIcon={is7702Loading ? <CircularProgress size={16} /> : null}
                                >
                                    {is7702Loading ? 'Processing...' : 'Enable & Approve'}
                                </Button>
                            </StepContent>
                        </Step>

                        <Step>
                            <StepLabel>Approve Tokens</StepLabel>
                            <StepContent>
                                <Typography variant="body2" mb={2}>
                                    Approve USDC, USDT, and WETH for fees and trading.
                                </Typography>
                                <Button
                                    variant="contained"
                                    onClick={handleApproveTokens}
                                    startIcon={is7702Loading ? <CircularProgress size={16} /> : null}
                                >
                                    Approve Tokens
                                </Button>
                            </StepContent>
                        </Step>

                        <Step>
                            <StepLabel>Complete</StepLabel>
                            <StepContent>
                                <Alert severity="success" sx={{ mb: 2 }}>
                                    🎉 Your EOA is now a Smart Account with manager access!
                                </Alert>
                                <Button variant="contained" color="success" onClick={handleConfirm} startIcon={<CheckCircleIcon />}>
                                    Complete Setup
                                </Button>
                            </StepContent>
                        </Step>
                    </Stepper>
                )}

                {/* ============ SAFE FLOW ============ */}
                {walletType === 'safe' && (
                    <Stepper activeStep={activeStep} orientation="vertical">
                        <Step>
                            <StepLabel>Connect Safe</StepLabel>
                            <StepContent>
                                <Typography variant="body2" color="text.secondary" mb={2}>
                                    Enter your Safe address. You must be an owner of this Safe.
                                </Typography>
                                <TextField
                                    fullWidth
                                    label="Safe Address"
                                    placeholder="0x..."
                                    value={safeAddress}
                                    onChange={(e) => setSafeAddress(e.target.value)}
                                    sx={{ mb: 2 }}
                                />
                                {connectError && <Alert severity="error" sx={{ mb: 2 }}>{connectError}</Alert>}
                                {safeError && <Alert severity="error" sx={{ mb: 2 }}>{safeError}</Alert>}
                                <Button
                                    variant="contained"
                                    onClick={handleSafeConnect}
                                    disabled={isSafeLoading}
                                    startIcon={isSafeLoading ? <CircularProgress size={16} /> : <SecurityIcon />}
                                >
                                    {isSafeLoading ? 'Connecting...' : 'Connect Safe'}
                                </Button>
                            </StepContent>
                        </Step>

                        <Step>
                            <StepLabel>Enable Modules</StepLabel>
                            <StepContent>
                                {safeState.isModuleEnabled ? (
                                    <Alert severity="success" sx={{ mb: 2 }}>
                                        Both modules are enabled!
                                    </Alert>
                                ) : (
                                    <Alert severity="info" sx={{ mb: 2 }}>
                                        Enable the required modules (Delegation + Trading) for manager trading.
                                    </Alert>
                                )}
                                {safeError && <Alert severity="error" sx={{ mb: 2 }}>{safeError}</Alert>}
                                <Button
                                    variant="contained"
                                    onClick={handleEnableModule}
                                    disabled={isSafeLoading && !safeState.isModuleEnabled}
                                    startIcon={isSafeLoading ? <CircularProgress size={16} /> : null}
                                >
                                    {isSafeLoading ? 'Enabling...' : safeState.isModuleEnabled ? 'Continue' : 'Enable Modules'}
                                </Button>
                            </StepContent>
                        </Step>

                        <Step>
                            <StepLabel>Approve Manager</StepLabel>
                            <StepContent>
                                <Typography variant="body2" mb={2}>
                                    Grant trading permissions to your manager.
                                </Typography>
                                {safeError && <Alert severity="error" sx={{ mb: 2 }}>{safeError}</Alert>}
                                {delegationError && <Alert severity="error" sx={{ mb: 2 }}>{delegationError}</Alert>}
                                <Button
                                    variant="contained"
                                    onClick={handleSafeApprove}
                                    disabled={isSafeLoading || isDelegating}
                                    startIcon={(isSafeLoading || isDelegating) ? <CircularProgress size={16} /> : null}
                                >
                                    {(isSafeLoading || isDelegating) ? 'Approving...' : 'Approve Manager'}
                                </Button>
                            </StepContent>
                        </Step>

                        <Step>
                            <StepLabel>Approve Tokens</StepLabel>
                            <StepContent>
                                <Typography variant="body2" mb={2}>
                                    Approve USDC, USDT, and WETH for fees and trading.
                                </Typography>
                                <Button
                                    variant="contained"
                                    onClick={handleApproveTokens}
                                    disabled={isSafeLoading}
                                >
                                    Approve Tokens
                                </Button>
                            </StepContent>
                        </Step>

                        <Step>
                            <StepLabel>Complete</StepLabel>
                            <StepContent>
                                <Alert severity="success" sx={{ mb: 2 }}>
                                    Your Safe is now delegated to the manager!
                                </Alert>
                                <Button variant="contained" color="success" onClick={handleConfirm} startIcon={<CheckCircleIcon />}>
                                    Complete Setup
                                </Button>
                            </StepContent>
                        </Step>
                    </Stepper>
                )}
            </Paper>
        </Container>
    )
}
