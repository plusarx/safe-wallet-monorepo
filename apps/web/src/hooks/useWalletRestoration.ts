import { useState, useEffect } from 'react'
import { localItem } from '@/services/local-storage/local'

const RESTORATION_TIMEOUT_MS = 2000

export const useWalletRestoration = (walletAddress: string | undefined) => {
  const [isRestoring, setIsRestoring] = useState(true)

  useEffect(() => {
    const lastWallet = localItem<string>('lastWallet').get()

    // If no previous wallet was saved, we are not restoring
    if (!lastWallet) {
      setIsRestoring(false)
      return
    }

    // If wallet address matches, restoration is complete
    if (walletAddress) {
      setIsRestoring(false)
      return
    }

    // Otherwise, wait for timeout
    const timer = setTimeout(() => {
      setIsRestoring(false)
    }, RESTORATION_TIMEOUT_MS)

    return () => clearTimeout(timer)
  }, [walletAddress])

  return isRestoring
}
