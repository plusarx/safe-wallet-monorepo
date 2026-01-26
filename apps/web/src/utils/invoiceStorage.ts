/**
 * Invoice localStorage utilities
 * Shared between manager and client dashboards
 */

import type { Invoice } from '@/utils/invoiceTypes'

const INVOICES_STORAGE_KEY = 'pulsarx_invoices'

/**
 * Load all invoices from localStorage
 */
const loadAllInvoices = (): Invoice[] => {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(INVOICES_STORAGE_KEY)
    if (!stored) return []
    const invoices = JSON.parse(stored)
    // Convert date strings back to Date objects
    return invoices.map((invoice: Invoice) => ({
      ...invoice,
      createdAt: new Date(invoice.createdAt),
      updatedAt: invoice.updatedAt ? new Date(invoice.updatedAt) : undefined,
    }))
  } catch {
    return []
  }
}

/**
 * Save all invoices to localStorage
 */
const saveAllInvoices = (invoices: Invoice[]): void => {
  if (typeof window === 'undefined') return
  localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(invoices))
}

/**
 * Save a new invoice
 */
export const saveInvoice = (invoice: Invoice): void => {
  const invoices = loadAllInvoices()
  invoices.unshift(invoice) // Add to beginning
  saveAllInvoices(invoices)
}

/**
 * Get all invoices for a specific client address
 */
export const getInvoicesForClient = (clientAddress: string): Invoice[] => {
  const invoices = loadAllInvoices()
  return invoices.filter((inv) => inv.clientAddress.toLowerCase() === clientAddress.toLowerCase())
}

/**
 * Get pending invoices for a specific client address
 */
export const getPendingInvoicesForClient = (clientAddress: string): Invoice[] => {
  return getInvoicesForClient(clientAddress).filter((inv) => inv.status === 'pending')
}

/**
 * Get all invoices created by a specific manager
 */
export const getInvoicesForManager = (managerAddress: string): Invoice[] => {
  const invoices = loadAllInvoices()
  return invoices.filter((inv) => inv.managerAddress.toLowerCase() === managerAddress.toLowerCase())
}

/**
 * Update invoice status (approve/reject)
 */
export const updateInvoiceStatus = (invoiceId: string, status: 'approved' | 'rejected'): boolean => {
  const invoices = loadAllInvoices()
  const index = invoices.findIndex((inv) => inv.id === invoiceId)

  if (index === -1) return false

  invoices[index] = {
    ...invoices[index],
    status,
    updatedAt: new Date(),
  }

  saveAllInvoices(invoices)
  return true
}

/**
 * Generate a unique invoice ID
 */
export const generateInvoiceId = (): string => {
  return `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
