'use client'

import React, { useState, useMemo } from 'react'
import { Box, IconButton, Dialog, DialogContent, Tooltip, Typography } from '@mui/material'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'

interface TradingViewChartProps {
  tokenIn: string
  tokenOut: string
}

// Map token symbols to TradingView symbol format
const getChartSymbol = (tokenIn: string, tokenOut: string): string => {
  const symbolMap: Record<string, string> = {
    'WETH-USDC': 'BINANCE:ETHUSDC',
    'USDC-WETH': 'BINANCE:ETHUSDC',
    'WETH-USDT': 'BINANCE:ETHUSDT',
    'USDT-WETH': 'BINANCE:ETHUSDT',
    'USDC-USDT': 'BINANCE:USDCUSDT',
    'USDT-USDC': 'BINANCE:USDCUSDT',
  }
  const key = `${tokenIn}-${tokenOut}`
  return symbolMap[key] || 'BINANCE:ETHUSDC'
}

// Generate TradingView widget URL
const getTradingViewUrl = (symbol: string): string => {
  const params = new URLSearchParams({
    symbol,
    interval: '60',
    timezone: 'Etc/UTC',
    theme: 'dark',
    style: '1',
    locale: 'en',
    withdateranges: 'true',
    hide_side_toolbar: 'false',
    allow_symbol_change: 'true',
    save_image: 'true',
    calendar: 'false',
    hide_volume: 'false',
  })
  return `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&${params.toString()}`
}

export default function TradingViewChart({ tokenIn, tokenOut }: TradingViewChartProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const symbol = useMemo(() => getChartSymbol(tokenIn, tokenOut), [tokenIn, tokenOut])
  const iframeUrl = useMemo(() => getTradingViewUrl(symbol), [symbol])

  return (
    <>
      {/* Normal View */}
      <Box
        sx={{
          height: '100%',
          width: '100%',
          minHeight: 400,
          position: 'relative',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: '#131722',
        }}
      >
        {/* Expand Button */}
        <Tooltip title="Expand Chart">
          <IconButton
            onClick={() => setIsExpanded(true)}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              bgcolor: 'rgba(0,0,0,0.6)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(0,0,0,0.8)',
              },
            }}
            size="small"
          >
            <FullscreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Chart iframe */}
        {!isExpanded && (
          <iframe
            src={iframeUrl}
            style={{
              width: '100%',
              height: '100%',
              minHeight: 400,
              border: 'none',
            }}
            allowFullScreen
            allow="encrypted-media"
          />
        )}
      </Box>

      {/* Fullscreen Dialog */}
      <Dialog
        open={isExpanded}
        onClose={() => setIsExpanded(false)}
        maxWidth={false}
        fullScreen
        PaperProps={{
          sx: {
            bgcolor: '#131722',
          },
        }}
      >
        <DialogContent
          sx={{
            p: 0,
            height: '100vh',
            width: '100vw',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 1,
              px: 2,
              bgcolor: '#1e222d',
              borderBottom: '1px solid #363a45',
            }}
          >
            <Typography variant="subtitle1" fontWeight={600} color="white">
              {symbol.replace('BINANCE:', '')}
            </Typography>
            <Tooltip title="Exit Fullscreen">
              <IconButton onClick={() => setIsExpanded(false)} sx={{ color: 'white' }} size="small">
                <FullscreenExitIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Expanded Chart */}
          <Box sx={{ flex: 1, width: '100%' }}>
            {isExpanded && (
              <iframe
                src={iframeUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                allowFullScreen
                allow="encrypted-media"
              />
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </>
  )
}
