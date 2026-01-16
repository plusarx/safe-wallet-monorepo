import { Box, Button, Checkbox, Divider, Radio, RadioGroup, Switch, Typography } from '@mui/material'
import { FormProvider, useForm, Controller } from 'react-hook-form'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import type { ReactElement } from 'react'
import { useState } from 'react'

import type { StepRenderProps } from '@/components/new-safe/CardStepper/useCardStepper'
import type { NewSafeFormData } from '@/components/new-safe/create'
import type { CreateSafeInfoItem } from '@/components/new-safe/create/CreateSafeInfos'
import layoutCss from '@/components/new-safe/create/styles.module.css'
import css from './styles.module.css'
import { QUANT_STRATEGIES, RISK_PROFILES, type RiskProfile } from '@/config/pulsarx'

export enum QuantManagerStepFields {
    quantEnabled = 'quantEnabled',
    riskProfile = 'riskProfile',
    selectedStrategies = 'selectedStrategies',
}

export type QuantManagerStepForm = {
    [QuantManagerStepFields.quantEnabled]: boolean
    [QuantManagerStepFields.riskProfile]: RiskProfile
    [QuantManagerStepFields.selectedStrategies]: string[]
}

const QUANT_MANAGER_STEP_FORM_ID = 'create-safe-quant-manager-step-form'

type RiskProfileSelectorProps = {
    value: RiskProfile
    onChange: (value: RiskProfile) => void
}

const RiskProfileSelector = ({ value, onChange }: RiskProfileSelectorProps): ReactElement => {
    const profiles = Object.entries(RISK_PROFILES) as [RiskProfile, { label: string; description: string }][]

    return (
        <div className={css.riskProfileSection}>
            <Typography variant="subtitle2" fontWeight={600} mb={2}>
                Choose Risk Profile
            </Typography>
            <RadioGroup value={value} onChange={(e) => onChange(e.target.value as RiskProfile)}>
                {profiles.map(([key, profile]) => (
                    <div
                        key={key}
                        className={`${css.riskOption} ${value === key ? css.selected : ''}`}
                        onClick={() => onChange(key)}
                    >
                        <Radio value={key} size="small" sx={{ p: 0, mt: 0.5 }} />
                        <div className={css.riskInfo}>
                            <div className={css.riskLabel}>{profile.label}</div>
                            <div className={css.riskDescription}>{profile.description}</div>
                        </div>
                    </div>
                ))}
            </RadioGroup>
        </div>
    )
}

type StrategySelectorProps = {
    selectedStrategies: string[]
    onToggle: (strategyId: string) => void
    riskProfile: RiskProfile
}

const StrategySelector = ({ selectedStrategies, onToggle, riskProfile }: StrategySelectorProps): ReactElement => {
    // Filter strategies based on risk profile
    const compatibleStrategies = QUANT_STRATEGIES.filter((s) => {
        if (riskProfile === 'conservative') return s.riskLevel === 'conservative'
        if (riskProfile === 'moderate') return s.riskLevel !== 'aggressive'
        return true // aggressive can use all
    })

    return (
        <div>
            <Typography variant="subtitle2" fontWeight={600} mb={1} mt={3}>
                Initial Strategies
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
                Select the automated strategies you want to enable
            </Typography>
            <div className={css.strategyGrid}>
                {QUANT_STRATEGIES.map((strategy) => {
                    const isCompatible = compatibleStrategies.some((s) => s.id === strategy.id)
                    const isSelected = selectedStrategies.includes(strategy.id)

                    return (
                        <div
                            key={strategy.id}
                            className={`${css.strategyCard} ${isSelected ? css.selected : ''} ${!isCompatible ? css.disabledOverlay : ''}`}
                            onClick={() => isCompatible && onToggle(strategy.id)}
                        >
                            <Checkbox checked={isSelected} disabled={!isCompatible} size="small" sx={{ p: 0 }} />
                            <div className={css.strategyInfo}>
                                <div className={css.strategyName}>{strategy.name}</div>
                                <div className={css.strategyDescription}>{strategy.description}</div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

const QuantManagerStep = ({
    onSubmit,
    onBack,
    data,
    setDynamicHint,
}: StepRenderProps<NewSafeFormData> & {
    setDynamicHint: (hints: CreateSafeInfoItem | undefined) => void
}): ReactElement => {
    const formMethods = useForm<QuantManagerStepForm>({
        mode: 'onChange',
        defaultValues: {
            [QuantManagerStepFields.quantEnabled]: data.quantEnabled || false,
            [QuantManagerStepFields.riskProfile]: data.riskProfile || 'moderate',
            [QuantManagerStepFields.selectedStrategies]: data.selectedStrategies || ['yield-optimization', 'auto-rebalancing'],
        },
    })

    const { handleSubmit, control, watch, setValue } = formMethods

    const quantEnabled = watch(QuantManagerStepFields.quantEnabled)
    const riskProfile = watch(QuantManagerStepFields.riskProfile)
    const selectedStrategies = watch(QuantManagerStepFields.selectedStrategies)

    const handleBack = () => {
        onBack({
            ...data,
            quantEnabled,
            riskProfile,
            selectedStrategies,
        })
    }

    const onFormSubmit = handleSubmit((formData) => {
        onSubmit({
            quantEnabled: formData.quantEnabled,
            riskProfile: formData.riskProfile,
            selectedStrategies: formData.quantEnabled ? formData.selectedStrategies : [],
        })
    })

    return (
        <form onSubmit={onFormSubmit} id={QUANT_MANAGER_STEP_FORM_ID}>
            <FormProvider {...formMethods}>
                <Box className={layoutCss.row}>
                    <div className={css.toggleCard}>
                        <div className={css.toggleHeader}>
                            <div className={css.toggleTitle}>
                                <div>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        Enable Portfolio Management
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Let our DeFi Asset Manager automate your trading strategies
                                    </Typography>
                                </div>
                                <span className={css.aiLabel}>AI</span>
                            </div>
                            <Controller
                                control={control}
                                name={QuantManagerStepFields.quantEnabled}
                                render={({ field }) => (
                                    <Switch
                                        checked={field.value}
                                        onChange={(e) => field.onChange(e.target.checked)}
                                        color="primary"
                                    />
                                )}
                            />
                        </div>

                        {quantEnabled && (
                            <Box mt={2}>
                                <Controller
                                    control={control}
                                    name={QuantManagerStepFields.riskProfile}
                                    render={({ field }) => (
                                        <RiskProfileSelector value={field.value} onChange={field.onChange} />
                                    )}
                                />

                                <Controller
                                    control={control}
                                    name={QuantManagerStepFields.selectedStrategies}
                                    render={({ field }) => (
                                        <StrategySelector
                                            selectedStrategies={field.value}
                                            riskProfile={riskProfile}
                                            onToggle={(strategyId) => {
                                                const newValue = field.value.includes(strategyId)
                                                    ? field.value.filter((id) => id !== strategyId)
                                                    : [...field.value, strategyId]
                                                field.onChange(newValue)
                                            }}
                                        />
                                    )}
                                />
                            </Box>
                        )}
                    </div>

                    {!quantEnabled && (
                        <Box mt={3} p={2} sx={{ background: 'var(--color-background-light)', borderRadius: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                                <strong>Manual Management:</strong> You'll manage your portfolio manually through the trading interface.
                                You can enable the Asset Manager later from your Safe settings.
                            </Typography>
                        </Box>
                    )}
                </Box>

                <Divider />

                <Box className={layoutCss.row}>
                    <Box display="flex" flexDirection="row" justifyContent="space-between" gap={3}>
                        <Button
                            data-testid="back-btn"
                            variant="outlined"
                            size="small"
                            onClick={handleBack}
                            startIcon={<ArrowBackIcon fontSize="small" />}
                        >
                            Back
                        </Button>
                        <Button data-testid="next-btn" type="submit" variant="contained" size="stretched">
                            Next
                        </Button>
                    </Box>
                </Box>
            </FormProvider>
        </form>
    )
}

export default QuantManagerStep
