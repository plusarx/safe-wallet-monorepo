/**
 * Invoice types for manager-client billing
 */

export interface Invoice {
  id: string
  managerAddress: string
  managerName?: string
  clientAddress: string
  amount: number // USD amount
  status: 'pending' | 'approved' | 'rejected'
  createdAt: Date
  updatedAt?: Date
  description?: string
}

export type InvoiceStatus = Invoice['status']
