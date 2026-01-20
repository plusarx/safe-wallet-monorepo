import { useEffect, useRef, useCallback } from 'react'
import useOnboard, { type ConnectedWallet } from '@/hooks/wallets/useOnboard'

const INACTIVITY_LIMIT_MS = 5 * 60 * 1000 // 5 minutes

export const useInactivityLogout = (connectedWallet: ConnectedWallet | null) => {
  const onboard = useOnboard()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const disconnect = useCallback(() => {
    if (onboard && connectedWallet) {
      console.log('Inactivity timeout: disconnecting wallet')
      onboard.disconnectWallet({ label: connectedWallet.label })
    }
  }, [onboard, connectedWallet])

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    if (connectedWallet) {
      timerRef.current = setTimeout(disconnect, INACTIVITY_LIMIT_MS)
    }
  }, [connectedWallet, disconnect])

  useEffect(() => {
    if (!connectedWallet) return

    // Initial timer
    resetTimer()

    // Event listeners
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    const handleActivity = () => resetTimer()

    events.forEach((event) => {
      window.addEventListener(event, handleActivity)
    })

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity)
      })
    }
  }, [connectedWallet, resetTimer])
}
