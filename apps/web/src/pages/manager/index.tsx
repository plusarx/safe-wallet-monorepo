'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
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
  CircularProgress,
} from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import MenuIcon from '@mui/icons-material/Menu'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import SummarizeIcon from '@mui/icons-material/Summarize'
import DashboardIcon from '@mui/icons-material/Dashboard'
import PeopleIcon from '@mui/icons-material/People'

// Import page components
import Home from './sections/Home'
import Terminal from './sections/Terminal'
import Clients from './sections/Clients'
import Summary from './sections/Summary'

// Safe wallet hooks
import useWallet from '@/hooks/wallets/useWallet'
import { useWalletRestoration } from '@/hooks/useWalletRestoration'

const DRAWER_WIDTH = 240
const DRAWER_WIDTH_COLLAPSED = 64

type PageId = 'home' | 'terminal' | 'clients' | 'summary'

const pages = [
  { id: 'home' as PageId, label: 'Home', icon: <DashboardIcon /> },
  { id: 'terminal' as PageId, label: 'Terminal', icon: <ShowChartIcon /> },
  { id: 'clients' as PageId, label: 'Clients', icon: <PeopleIcon /> },
  { id: 'summary' as PageId, label: 'Summary', icon: <SummarizeIcon /> },
]

export default function ManagerDashboard() {
  const theme = useTheme()
  const router = useRouter()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activePage, setActivePage] = useState<PageId>('home')

  // Centralized wallet connection
  const wallet = useWallet()
  const walletAddress = wallet?.address || ''
  const isRestoring = useWalletRestoration(walletAddress)

  const drawerWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH

  useEffect(() => {
    // Only redirect if we are NOT restoring and still have no wallet
    if (!isRestoring && !walletAddress) {
      router.push('/')
    }
  }, [walletAddress, isRestoring, router])

  const handlePageChange = (pageId: PageId) => {
    setActivePage(pageId)
    if (isMobile) {
      setMobileOpen(false)
    }
  }

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return <Home />
      case 'summary':
        return <Summary />
      case 'terminal':
        return <Terminal />
      case 'clients':
        return <Clients />
      default:
        return <Home />
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

  // Show loading during restoration to prevent redirect flash
  if (isRestoring && !walletAddress) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    )
  }

  // If not restoring and no wallet, effect will redirect. Render nothing or prompt.
  if (!walletAddress) {
    return null // Will redirect via useEffect
  }

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
            <IconButton edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 2 }}>
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
          pb: { xs: 6, md: 6 },
          backgroundColor: 'var(--color-background-main)',
          minHeight: '100vh',
          width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ flex: 1 }}>{renderPage()}</Box>

        {/* Footer */}
        <Typography
          variant="body2"
          sx={{
            textAlign: 'center',
            color: 'text.secondary',
            py: 2,
            mt: 'auto',
          }}
        >
          © 2025 PulsarX. All rights reserved.
        </Typography>
      </Box>
    </Box>
  )
}
