'use client'

import { Container, Typography, Grid, Paper } from '@mui/material'
import { useState } from 'react'
import ProtocolSelectionStep from '@/components/new-safe/create/steps/ProtocolSelectionStep'
import QuantManagerStep from '@/components/new-safe/create/steps/QuantManagerStep'
import type { NewSafeFormData } from '@/components/new-safe/create'

// Mock data to simulate being in the create safe flow
const mockData: NewSafeFormData = {
    name: 'Test PulsarX Safe',
    networks: [
        { chainId: '1', chainName: 'Ethereum', shortName: 'eth' } as any,
        { chainId: '42161', chainName: 'Arbitrum One', shortName: 'arb1' } as any,
    ],
    owners: [{ name: 'Owner 1', address: '0x1234567890123456789012345678901234567890' }],
    threshold: 1,
    safeVersion: '1.4.1' as any,
    selectedProtocols: [],
    quantEnabled: false,
    riskProfile: 'moderate',
    selectedStrategies: [],
}

export default function PulsarXPreview() {
    const [activeStep, setActiveStep] = useState<'protocol' | 'quant'>('protocol')
    const [data, setData] = useState(mockData)

    const handleSubmit = (newData: Partial<NewSafeFormData>) => {
        setData((prev) => ({ ...prev, ...newData }))
        if (activeStep === 'protocol') {
            setActiveStep('quant')
        } else {
            alert('Configuration complete!\n\n' + JSON.stringify({ ...data, ...newData }, null, 2))
        }
    }

    const handleBack = () => {
        if (activeStep === 'quant') {
            setActiveStep('protocol')
        }
    }

    const setDynamicHint = () => { }
    const setStep = () => { }

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Typography variant="h3" gutterBottom sx={{ mb: 4 }}>
                PulsarX New Steps Preview
            </Typography>

            <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item>
                    <Paper
                        onClick={() => setActiveStep('protocol')}
                        sx={{
                            p: 2,
                            cursor: 'pointer',
                            border: activeStep === 'protocol' ? '2px solid #6C5CE7' : '1px solid #ccc',
                            bgcolor: activeStep === 'protocol' ? 'rgba(108, 92, 231, 0.1)' : 'background.paper',
                        }}
                    >
                        <Typography variant="subtitle1" fontWeight={600}>
                            Step 3: Protocol Selection
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item>
                    <Paper
                        onClick={() => setActiveStep('quant')}
                        sx={{
                            p: 2,
                            cursor: 'pointer',
                            border: activeStep === 'quant' ? '2px solid #6C5CE7' : '1px solid #ccc',
                            bgcolor: activeStep === 'quant' ? 'rgba(108, 92, 231, 0.1)' : 'background.paper',
                        }}
                    >
                        <Typography variant="subtitle1" fontWeight={600}>
                            Step 4: Asset Manager
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Paper elevation={2} sx={{ overflow: 'hidden' }}>
                {activeStep === 'protocol' ? (
                    <ProtocolSelectionStep
                        data={data}
                        onSubmit={handleSubmit}
                        onBack={handleBack}
                        setStep={setStep}
                        setDynamicHint={setDynamicHint}
                    />
                ) : (
                    <QuantManagerStep
                        data={data}
                        onSubmit={handleSubmit}
                        onBack={handleBack}
                        setStep={setStep}
                        setDynamicHint={setDynamicHint}
                    />
                )}
            </Paper>

            <Paper sx={{ mt: 4, p: 2, bgcolor: 'grey.100' }}>
                <Typography variant="subtitle2" gutterBottom>
                    Current Configuration:
                </Typography>
                <Typography variant="body2" component="pre" sx={{ fontSize: 12, overflow: 'auto' }}>
                    {JSON.stringify(
                        {
                            selectedProtocols: data.selectedProtocols,
                            quantEnabled: data.quantEnabled,
                            riskProfile: data.riskProfile,
                            selectedStrategies: data.selectedStrategies,
                        },
                        null,
                        2,
                    )}
                </Typography>
            </Paper>
        </Container>
    )
}
