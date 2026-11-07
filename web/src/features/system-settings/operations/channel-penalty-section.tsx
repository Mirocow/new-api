/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { AlertCircle, Info } from 'lucide-react'
import { useUpdateOption } from '../hooks/use-update-option'

import type { OperationsSettings } from '../types'

interface ChannelPenaltySectionProps {
  defaultValues: Pick<
    OperationsSettings,
    | 'channel_penalty_setting.enabled'
    | 'channel_penalty_setting.status_codes'
    | 'channel_penalty_setting.duration'
    | 'channel_penalty_setting.max_penalties'
    | 'channel_penalty_setting.recovery_threshold'
  >
}

export function ChannelPenaltySection({
  defaultValues,
}: ChannelPenaltySectionProps) {
  const { t } = useTranslation()

  const form = useForm<ChannelPenaltySectionProps['defaultValues']>({
    defaultValues,
    mode: 'onChange',
  })

  // Watch for changes to enable/disable other fields
  const enabled = form.watch('channel_penalty_setting.enabled')

  const updateOption = useUpdateOption()

  const handleSubmit = async (values: ChannelPenaltySectionProps['defaultValues']) => {
    // Update each setting individually
    const updates: Array<{ key: string; value: string | boolean | number }> = [
      { key: 'channel_penalty_setting.enabled', value: values['channel_penalty_setting.enabled'] },
      { key: 'channel_penalty_setting.status_codes', value: values['channel_penalty_setting.status_codes'] },
      { key: 'channel_penalty_setting.duration', value: values['channel_penalty_setting.duration'] },
      { key: 'channel_penalty_setting.max_penalties', value: values['channel_penalty_setting.max_penalties'] },
      { key: 'channel_penalty_setting.recovery_threshold', value: values['channel_penalty_setting.recovery_threshold'] },
    ]

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
  }

  // Sync form values to defaultValues when they change externally
  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <AlertCircle className='h-5 w-5 text-warning' />
              {t('Channel Penalty (Auto-Exclusion)')}
            </CardTitle>
            <CardDescription>
              {t(
                'Automatically exclude channels that return specific error codes for a configurable duration. This prevents repeated failed requests to unhealthy upstreams.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <FormField
              control={form.control}
              name='channel_penalty_setting.enabled'
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className='flex items-center justify-between'>
                      <div className='space-y-1'>
                        <FormLabel>
                          {t('Enable Channel Penalty')}
                        </FormLabel>
                        <FormMessage>
                          {t(
                            'When enabled, channels returning configured error codes will be temporarily excluded from selection.'
                          )}
                        </FormMessage>
                      </div>
                      <Switch
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                      />
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />

            <Separator />

            <div className='space-y-4' style={{ opacity: enabled ? 1 : 0.5 }}>
              <FormField
                control={form.control}
                name='channel_penalty_setting.status_codes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Error Status Codes')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='429,500-599'
                        disabled={!enabled}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Comma-separated list of HTTP status codes that trigger penalty. Supports ranges like 500-599.'
                      )}
                    </FormDescription>
                    <FormMessage>
                      {t(
                        'Comma-separated list of HTTP status codes that trigger penalty. Supports ranges like 500-599.'
                      )}
                    </FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='channel_penalty_setting.duration'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Penalty Duration')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min='1'
                        disabled={!enabled}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('seconds')}
                    </FormDescription>
                    <FormMessage>
                      {t(
                        'How long the channel stays penalized before being eligible for selection again.'
                      )}
                    </FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='channel_penalty_setting.max_penalties'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Max Penalties Before Longer Exclusion')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min='1'
                        disabled={!enabled}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('times')}
                    </FormDescription>
                    <FormMessage>
                      {t(
                        'After this many penalties, the channel will be excluded for a longer period (duration × penalty count).'
                      )}
                    </FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='channel_penalty_setting.recovery_threshold'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Recovery Threshold (Successful Requests)')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min='1'
                        disabled={!enabled}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('requests')}
                    </FormDescription>
                    <FormMessage>
                      {t(
                        'Number of consecutive successful requests required to reset the penalty count for a channel.'
                      )}
                    </FormMessage>
                  </FormItem>
                )}
              />
            </div>

            <div className='flex items-center gap-2 p-3 bg-muted/50 rounded-lg'>
              <Info className='h-4 w-4 text-muted-foreground flex-shrink-0' />
              <p className='text-sm text-muted-foreground'>
                {t(
                  'Penalized channels are excluded during channel selection but can still be selected if ALL available channels are penalized (degraded service > no service).'
                )}
              </p>
            </div>

            <div className='flex justify-end'>
              <Button type='submit' disabled={updateOption.isPending}>
                {updateOption.isPending ? t('Saving...') : t('Save Settings')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  )
}