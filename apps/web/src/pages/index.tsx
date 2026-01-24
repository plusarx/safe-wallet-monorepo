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
        bgcolor: '#121212', // Dark background
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 4,
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
          height: 64,
          borderRadius: 5,
          mb: 8,
          px: 3,
        }}
      />

      <Grid container spacing={4} justifyContent="center" maxWidth="lg">
        {/* Client Card */}
        <Grid item xs={12} md={5}>
          <Paper
            elevation={0}
            sx={{
              p: 6,
              height: 500,
              border: '4px solid #00C853',
              borderRadius: 6,
              bgcolor: '#1E1E1E', // Darker paper
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              '&:hover': {
                boxShadow: '0 8px 32px rgba(0,200,83,0.1)', // Greenish shadow on hover
              },
            }}
          >
            <Box>
              <Typography
                variant="h2"
                component="h2"
                fontFamily="serif"
                fontWeight={400}
                gutterBottom
                sx={{ color: '#FFFFFF', fontSize: '3rem' }}
              >
                Login as client
              </Typography>
            </Box>

            <Box
              sx={{
                bgcolor: '#D4F788', // Light lime green button
                color: '#1A1A1A',
                fontWeight: 700,
                fontSize: '1.2rem',
                py: 2.5,
                px: 4,
                borderRadius: 50,
                userSelect: 'none',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'scale(1.02)',
                  boxShadow: '0 0 15px rgba(212, 247, 136, 0.4)',
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
              p: 6,
              height: 500,
              width: 600,
              border: '4px solid #00C853',
              borderRadius: 6,
              bgcolor: '#1E1E1E', // Darker paper
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              '&:hover': {
                boxShadow: '0 8px 32px rgba(0,200,83,0.1)',
              },
            }}
          >
            <Box>
              <Typography
                variant="h2"
                component="h2"
                fontFamily="serif"
                fontWeight={400}
                gutterBottom
                sx={{ color: '#FFFFFF', fontSize: '3rem' }}
              >
                Login as fund manager
              </Typography>

              <Box sx={{ mt: 4, p: 3, bgcolor: '#2C2C2C', borderRadius: 3 }}>
                <Typography variant="body1" sx={{ color: '#E0E0E0', lineHeight: 1.9 }}>
                  Connect your wallet to manage funds, execute trades, and view analytics.
                </Typography>
                {!wallet?.address && (
                  <Typography variant="caption" sx={{ fontStyle: 'italic', color: '#B0B0B0', mt: 1, display: 'block' }}>
                    No wallet connected
                  </Typography>
                )}
              </Box>
            </Box>

            <Box
              sx={{
                bgcolor: '#D4F788', // Light lime green button
                color: '#1A1A1A',
                fontWeight: 700,
                fontSize: '1.2rem',
                py: 2.5,
                px: 4,
                borderRadius: 50,
                userSelect: 'none',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'scale(1.02)',
                  boxShadow: '0 0 15px rgba(212, 247, 136, 0.4)',
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

      {/* Footer */}
      <Typography
        variant="body2"
        sx={{
          position: 'absolute',
          bottom: 24,
          color: '#888888',
          textAlign: 'center',
        }}
      >
        © 2025 PulsarX. All rights reserved.
      </Typography>
    </Box>
  )
}

export default IndexPage
