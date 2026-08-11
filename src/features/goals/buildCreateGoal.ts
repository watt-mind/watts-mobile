import { addLocalMonthsYmd, isValidCalendarYmd } from '@/src/features/log/mapLogForm';
import { ymdToWireDate } from '@/src/lib/wireDate';

import type { CreateGoalInput, GoalType } from './types';

export type GoalCreateFormValues = {
  type: GoalType;
  title: string;
  /** YYYY-MM-DD */
  targetDate: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  metric: string;
  targetValue: string;
  startValue: string;
};

export function defaultGoalTargetDateYmd(monthsAhead = 3): string {
  return addLocalMonthsYmd(monthsAhead);
}

export function validateGoalCreateForm(values: GoalCreateFormValues): string | null {
  if (values.title.trim().length < 2) return 'Enter a goal title (at least 2 characters).';
  const targetDate = values.targetDate.trim();
  if (!isValidCalendarYmd(targetDate)) {
    return 'Enter a valid target date as YYYY-MM-DD.';
  }
  if (values.type === 'PERFORMANCE' || values.type === 'BODY_COMPOSITION') {
    if (values.targetValue.trim() && Number.isNaN(Number(values.targetValue))) {
      return 'Target value must be a number.';
    }
    if (values.startValue.trim() && Number.isNaN(Number(values.startValue))) {
      return 'Start value must be a number.';
    }
  }
  return null;
}

/** Build Bearer POST body; EVENT always includes eventData (server requires a linked event). */
export function buildCreateGoalInput(values: GoalCreateFormValues): CreateGoalInput {
  const title = values.title.trim();
  const dateIso = ymdToWireDate(values.targetDate.trim());
  const base: CreateGoalInput = {
    type: values.type,
    title,
    targetDate: dateIso,
    priority: values.priority,
  };
  if (values.description.trim()) {
    base.description = values.description.trim();
  }

  if (values.type === 'EVENT') {
    return {
      ...base,
      eventData: {
        title,
        date: dateIso,
        type: 'RACE',
      },
    };
  }

  if (values.type === 'PERFORMANCE' || values.type === 'BODY_COMPOSITION') {
    if (values.metric.trim()) base.metric = values.metric.trim();
    if (values.targetValue.trim()) base.targetValue = Number(values.targetValue);
    if (values.startValue.trim()) base.startValue = Number(values.startValue);
  }

  return base;
}
