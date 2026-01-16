'use client'

import { useState } from 'react'
import {
    Box,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    IconButton,
    Divider,
    Typography,
    useTheme,
    useMediaQuery,
    AppBar,
    Toolbar,
    Paper,
} from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import MenuIcon from '@mui/icons-material/Menu'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import LinkIcon from '@mui/icons-material/Link'
import SummarizeIcon from '@mui/icons-material/Summarize'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import TimelineIcon from '@mui/icons-material/Timeline'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'

// Import page components
import TradingTerminal from './sections/TradingTerminal'
import OnboardingLinks from './sections/OnboardingLinks'
import Summary from './sections/Summary'
import ExecutionDetails from './sections/ExecutionDetails'
import OrderTypes from './sections/OrderTypes'

// Safe wallet hooks
import useWallet from '@/hooks/wallets/useWallet'
import ConnectWalletButton from '@/components/common/ConnectWallet/ConnectWalletButton'

const DRAWER_WIDTH = 240
const DRAWER_WIDTH_COLLAPSED = 64

type PageId = 'trading' | 'orders' | 'onboarding' | 'summary' | 'execution'

const pages = [
    { id: 'trading' as PageId, label: 'Trading Terminal', icon: <ShowChartIcon /> },
    { id: 'orders' as PageId, label: 'Order Types', icon: <TimelineIcon /> },
    { id: 'onboarding' as PageId, label: 'Onboarding Links', icon: <LinkIcon /> },
    { id: 'summary' as PageId, label: 'Summary', icon: <SummarizeIcon /> },
    { id: 'execution' as PageId, label: 'Execution Details', icon: <ReceiptLongIcon /> },
]

export default function ManagerDashboard() {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))

    const [collapsed, setCollapsed] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)
    const [activePage, setActivePage] = useState<PageId>('trading')

    // Centralized wallet connection
    const wallet = useWallet()

    const drawerWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH

    const handlePageChange = (pageId: PageId) => {
        setActivePage(pageId)
        if (isMobile) {
            setMobileOpen(false)
        }
    }

    const renderPage = () => {
        switch (activePage) {
            case 'trading':
                return <TradingTerminal />
            case 'orders':
                return <OrderTypes />
            case 'onboarding':
                return <OnboardingLinks />
            case 'summary':
                return <Summary />
            case 'execution':
                return <ExecutionDetails />
            default:
                return <TradingTerminal />
        }
    }

    const drawerContent = (
        <>
            {/* Header */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed && !isMobile ? 'center' : 'space-between',
                    p: 2,
                    minHeight: 64,
                }}
            >
                {(!collapsed || isMobile) && (
                    <Typography variant="subtitle1" fontWeight={700} noWrap>
                        Manager
                    </Typography>
                )}
                {!isMobile && (
                    <IconButton onClick={() => setCollapsed(!collapsed)} size="small">
                        {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                    </IconButton>
                )}
            </Box>

            <Divider />

            {/* Navigation */}
            <List sx={{ px: 1, py: 2 }}>
                {pages.map((page) => (
                    <ListItem key={page.id} disablePadding sx={{ mb: 0.5 }}>
                        <ListItemButton
                            selected={activePage === page.id}
                            onClick={() => handlePageChange(page.id)}
                            sx={{
                                borderRadius: 2,
                                minHeight: 48,
                                justifyContent: collapsed && !isMobile ? 'center' : 'initial',
                                px: collapsed && !isMobile ? 2 : 2.5,
                                '&.Mui-selected': {
                                    backgroundColor: 'var(--color-primary-main)',
                                    color: 'white',
                                    '&:hover': {
                                        backgroundColor: 'var(--color-primary-dark)',
                                    },
                                    '& .MuiListItemIcon-root': {
                                        color: 'white',
                                    },
                                },
                            }}
                        >
                            <ListItemIcon
                                sx={{
                                    minWidth: 0,
                                    mr: collapsed && !isMobile ? 0 : 2,
                                    justifyContent: 'center',
                                    color: activePage === page.id ? 'white' : 'inherit',
                                }}
                            >
                                {page.icon}
                            </ListItemIcon>
                            {(!collapsed || isMobile) && <ListItemText primary={page.label} />}
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </>
    )

    // Centralized wallet connection prompt - shown once for all pages
    const renderWalletPrompt = () => (
        <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            minHeight="60vh"
        >
            <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 400 }}>
                <AccountBalanceWalletIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
                <Typography variant="h5" fontWeight={600} gutterBottom>
                    Connect Your Wallet
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={3}>
                    Connect your wallet to access the Manager Dashboard and start trading on behalf of your clients.
                </Typography>
                <ConnectWalletButton text="Connect Wallet" />
            </Paper>
        </Box>
    )

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            {/* Mobile App Bar */}
            {isMobile && (
                <AppBar
                    position="fixed"
                    sx={{
                        backgroundColor: 'var(--color-background-paper)',
                        color: 'inherit',
                        boxShadow: 1,
                    }}
                >
                    <Toolbar>
                        <IconButton
                            edge="start"
                            onClick={() => setMobileOpen(!mobileOpen)}
                            sx={{ mr: 2 }}
                        >
                            <MenuIcon />
                        </IconButton>
                        <Typography variant="h6" noWrap fontWeight={600}>
                            {pages.find((p) => p.id === activePage)?.label}
                        </Typography>
                    </Toolbar>
                </AppBar>
            )}

            {/* Mobile Drawer */}
            {isMobile ? (
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        '& .MuiDrawer-paper': {
                            width: DRAWER_WIDTH,
                            boxSizing: 'border-box',
                            background: 'var(--color-background-paper)',
                        },
                    }}
                >
                    {drawerContent}
                </Drawer>
            ) : (
                /* Desktop Drawer */
                <Drawer
                    variant="permanent"
                    sx={{
                        width: drawerWidth,
                        flexShrink: 0,
                        transition: theme.transitions.create('width', {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                        '& .MuiDrawer-paper': {
                            width: drawerWidth,
                            boxSizing: 'border-box',
                            transition: theme.transitions.create('width', {
                                easing: theme.transitions.easing.sharp,
                                duration: theme.transitions.duration.enteringScreen,
                            }),
                            overflowX: 'hidden',
                            borderRight: '1px solid var(--color-border-light)',
                            background: 'var(--color-background-paper)',
                        },
                    }}
                >
                    {drawerContent}
                </Drawer>
            )}

            {/* Main Content */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: { xs: 2, md: 3 },
                    pt: { xs: 10, md: 3 },
                    backgroundColor: 'var(--color-background-main)',
                    minHeight: '100vh',
                    width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
                }}
            >
                {wallet?.address ? renderPage() : renderWalletPrompt()}
            </Box>
        </Box>
    )
}
