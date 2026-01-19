import { useState, useEffect } from 'react'
import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import { Box, Typography, Paper, Grid, Chip } from '@mui/material'
import useWallet from '@/hooks/wallets/useWallet'
import useConnectWallet from '@/components/common/ConnectWallet/useConnectWallet'

const IndexPage: NextPage = () => {
  const router = useRouter()
  const wallet = useWallet()
  const connectWallet = useConnectWallet()
  const [targetRole, setTargetRole] = useState<'client' | 'manager' | null>(null)

  // Redirect if wallet is connected and we have a target role
  useEffect(() => {
    if (wallet?.address && targetRole) {
      if (targetRole === 'client') {
        router.push('/client')
      } else if (targetRole === 'manager') {
        router.push('/manager')
      }
    }
  }, [wallet, targetRole, router])

  const handleConnect = (role: 'client' | 'manager') => {
    if (wallet?.address) {
      // Already connected, just redirect
      if (role === 'client') {
        router.push('/client')
      } else {
        router.push('/manager')
      }
      return
    }
    setTargetRole(role)
    connectWallet()
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#F9F9F9', // Light background
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pt: 10,
        px: 2,
      }}
    >
      {/* Header Badge */}
      <Chip
        label="PulsarX DEX-Terminal"
        sx={{
          bgcolor: '#00C853', // Vivid Green
          color: 'white',
          fontWeight: 700,
          fontSize: '2.0rem',
          height: 48,
          borderRadius: 5,
          mb: 8,
          px: 2,
        }}
      />

      <Grid container spacing={4} justifyContent="center" maxWidth="lg">
        {/* Client Card */}
        <Grid item xs={12} md={5}>
          <Paper
            elevation={0}
            sx={{
              p: 5,
              height: 400,
              border: '4px solid #00C853',
              borderRadius: 4,
              bgcolor: '#FFFEF5', // Creamy white
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              '&:hover': {
                boxShadow: '0 8px 24px rgba(0,0,0,0.05)',
              },
            }}
          >
            <Box>
              <Typography
                variant="h1"
                component="h2"
                fontFamily="serif"
                fontWeight={400}
                gutterBottom
                sx={{ color: '#1A1A1A' }}
              >
                Login as client
              </Typography>
            </Box>

            <Box
              sx={{
                bgcolor: '#D4F788', // Light lime green button
                color: '#1A1A1A',
                fontWeight: 600,
                py: 2,
                px: 4,
                borderRadius: 10,
                userSelect: 'none',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'scale(1.02)',
                },
                '&:active': {
                  transform: 'scale(0.98)',
                },
              }}
              onClick={() => handleConnect('client')}
            >
              Connect Wallet
            </Box>
          </Paper>
        </Grid>

        {/* Fund Manager Card */}
        <Grid item xs={12} md={5}>
          <Paper
            elevation={0}
            sx={{
              p: 5,
              height: 400,
              border: '4px solid #00C853',
              borderRadius: 4,
              bgcolor: '#FFFEF5', // Creamy white
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              '&:hover': {
                boxShadow: '0 8px 24px rgba(0,0,0,0.05)',
              },
            }}
          >
            <Box>
              <Typography
                variant="h1"
                component="h2"
                fontFamily="serif"
                fontWeight={400}
                gutterBottom
                sx={{ color: '#1A1A1A' }}
              >
                Login as fund manager
              </Typography>

              <Box sx={{ mt: 4, p: 3, bgcolor: '#F5F5FA', borderRadius: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Connect your wallet to manage funds, execute trades, and view analytics.
                </Typography>
                {!wallet?.address && (
                  <Typography variant="caption" sx={{ fontStyle: 'italic', color: '#999' }}>
                    No wallet connected
                  </Typography>
                )}
              </Box>
            </Box>

            <Box
              sx={{
                bgcolor: '#D4F788', // Light lime green button
                color: '#1A1A1A',
                fontWeight: 600,
                py: 2,
                px: 4,
                borderRadius: 10,
                userSelect: 'none',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'scale(1.02)',
                },
                '&:active': {
                  transform: 'scale(0.98)',
                },
              }}
              onClick={() => handleConnect('manager')}
            >
              Connect Wallet
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default IndexPage
