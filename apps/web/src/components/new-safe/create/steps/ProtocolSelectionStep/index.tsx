import { Box, Button, Checkbox, Divider, Typography } from '@mui/material'
import { FormProvider, useForm, Controller } from 'react-hook-form'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import type { ReactElement } from 'react'

import type { StepRenderProps } from '@/components/new-safe/CardStepper/useCardStepper'
import type { NewSafeFormData } from '@/components/new-safe/create'
import type { CreateSafeInfoItem } from '@/components/new-safe/create/CreateSafeInfos'
import layoutCss from '@/components/new-safe/create/styles.module.css'
import css from './styles.module.css'
import {
    DEFI_PROTOCOLS,
    PROTOCOL_CATEGORIES,
    getProtocolsByCategory,
    type Protocol,
    type ProtocolCategory,
} from '@/config/pulsarx'

export enum ProtocolSelectionStepFields {
    selectedProtocols = 'selectedProtocols',
}

export type ProtocolSelectionStepForm = {
    [ProtocolSelectionStepFields.selectedProtocols]: string[]
}

const PROTOCOL_SELECTION_STEP_FORM_ID = 'create-safe-protocol-selection-step-form'

// Estimated gas per module installation (in USD)
const GAS_PER_MODULE = 15

type ProtocolCardProps = {
    protocol: Protocol
    selected: boolean
    onToggle: () => void
    disabled?: boolean
}

const ProtocolCard = ({ protocol, selected, onToggle, disabled }: ProtocolCardProps): ReactElement => {
    const isDisabled = disabled || protocol.comingSoon

    return (
        <div
            className={`${css.protocolCard} ${selected ? css.selected : ''} ${isDisabled ? css.disabled : ''}`}
            onClick={() => !isDisabled && onToggle()}
            role="checkbox"
            aria-checked={selected}
            tabIndex={0}
            onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
                    e.preventDefault()
                    onToggle()
                }
            }}
        >
            <Checkbox checked={selected} disabled={isDisabled} size="small" sx={{ p: 0 }} />
            <div className={css.protocolIcon}>
                {/* Fallback to first letter if no icon */}
                {protocol.name.charAt(0)}
            </div>
            <div className={css.protocolInfo}>
                <div className={css.protocolName}>{protocol.name}</div>
            </div>
            {protocol.comingSoon && <span className={css.comingSoonBadge}>Soon</span>}
        </div>
    )
}

type CategorySectionProps = {
    category: ProtocolCategory
    selectedProtocols: string[]
    onToggleProtocol: (protocolId: string) => void
    onSelectAllCategory: (category: ProtocolCategory, select: boolean) => void
    availableChainIds: string[]
}

const CategorySection = ({
    category,
    selectedProtocols,
    onToggleProtocol,
    onSelectAllCategory,
    availableChainIds,
}: CategorySectionProps): ReactElement => {
    const categoryInfo = PROTOCOL_CATEGORIES[category]
    const protocols = getProtocolsByCategory(category)

    // Get available protocols for this category (not coming soon and available on selected chains)
    const availableProtocols = protocols.filter(
        (p) => !p.comingSoon && availableChainIds.some((chainId) => p.chains.includes(chainId))
    )

    // Check if all available protocols in this category are selected
    const allSelected = availableProtocols.length > 0 &&
        availableProtocols.every((p) => selectedProtocols.includes(p.id))
    const someSelected = availableProtocols.some((p) => selectedProtocols.includes(p.id))

    return (
        <div className={css.categorySection}>
            <div className={css.categoryHeader}>
                <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={(e) => onSelectAllCategory(category, e.target.checked)}
                    size="small"
                    sx={{ p: 0, mr: 1 }}
                    disabled={availableProtocols.length === 0}
                />
                <Typography variant="subtitle1" fontWeight={600}>
                    {categoryInfo.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    ({availableProtocols.length} available)
                </Typography>
            </div>
            <div className={css.protocolGrid}>
                {protocols.map((protocol) => {
                    const isAvailable = availableChainIds.some((chainId) => protocol.chains.includes(chainId))
                    return (
                        <ProtocolCard
                            key={protocol.id}
                            protocol={protocol}
                            selected={selectedProtocols.includes(protocol.id)}
                            onToggle={() => onToggleProtocol(protocol.id)}
                            disabled={!isAvailable}
                        />
                    )
                })}
            </div>
        </div>
    )
}

const ProtocolSelectionStep = ({
    onSubmit,
    onBack,
    data,
    setDynamicHint,
}: StepRenderProps<NewSafeFormData> & {
    setDynamicHint: (hints: CreateSafeInfoItem | undefined) => void
}): ReactElement => {
    // Get available chain IDs from selected networks
    const availableChainIds = data.networks.map((network) => network.chainId)

    const formMethods = useForm<ProtocolSelectionStepForm>({
        mode: 'onChange',
        defaultValues: {
            [ProtocolSelectionStepFields.selectedProtocols]: data.selectedProtocols || [],
        },
    })

    const { handleSubmit, control, watch } = formMethods

    const selectedProtocols = watch(ProtocolSelectionStepFields.selectedProtocols)
    const estimatedGas = selectedProtocols.length * GAS_PER_MODULE

    const handleBack = () => {
        onBack({ ...data, selectedProtocols })
    }

    const onFormSubmit = handleSubmit((formData) => {
        onSubmit({ selectedProtocols: formData.selectedProtocols })
    })

    const categories: ProtocolCategory[] = ['dex', 'perps', 'yield', 'prediction']

    return (
        <form onSubmit={onFormSubmit} id={PROTOCOL_SELECTION_STEP_FORM_ID}>
            <FormProvider {...formMethods}>
                <Box className={layoutCss.row}>
                    <Typography variant="body2" color="text.secondary" mb={3}>
                        Select the DeFi protocols you want to use with your Safe Account. Trading modules will be installed for
                        each selected protocol.
                    </Typography>

                    <Controller
                        control={control}
                        name={ProtocolSelectionStepFields.selectedProtocols}
                        render={({ field }) => (
                            <>
                                {categories.map((category) => (
                                    <CategorySection
                                        key={category}
                                        category={category}
                                        selectedProtocols={field.value}
                                        availableChainIds={availableChainIds}
                                        onToggleProtocol={(protocolId) => {
                                            const newValue = field.value.includes(protocolId)
                                                ? field.value.filter((id) => id !== protocolId)
                                                : [...field.value, protocolId]
                                            field.onChange(newValue)
                                        }}
                                        onSelectAllCategory={(cat, select) => {
                                            const categoryProtocols = getProtocolsByCategory(cat)
                                                .filter((p) => !p.comingSoon && availableChainIds.some((chainId) => p.chains.includes(chainId)))
                                                .map((p) => p.id)

                                            if (select) {
                                                // Add all protocols from this category
                                                const newValue = [...new Set([...field.value, ...categoryProtocols])]
                                                field.onChange(newValue)
                                            } else {
                                                // Remove all protocols from this category
                                                const newValue = field.value.filter((id) => !categoryProtocols.includes(id))
                                                field.onChange(newValue)
                                            }
                                        }}
                                    />
                                ))}
                            </>
                        )}
                    />

                    <div className={css.selectionSummary}>
                        <Typography variant="body2">
                            <strong>{selectedProtocols.length}</strong> protocol{selectedProtocols.length !== 1 ? 's' : ''} selected
                        </Typography>
                        {selectedProtocols.length > 0 && (
                            <Typography variant="body2" className={css.gasEstimate}>
                                Est. module setup cost: ~${estimatedGas}
                            </Typography>
                        )}
                    </div>
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

export default ProtocolSelectionStep
