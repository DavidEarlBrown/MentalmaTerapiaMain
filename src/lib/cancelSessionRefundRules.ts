/**
 * Refund eligibility rules for session cancellation.
 * Replace or extend this module when business rules are finalized.
 */
import type { ClientRequest } from '../types';
import { getClientRequestStatusValue } from './sessionStatus';

export interface RefundEligibilityInput {
  request: ClientRequest;
  cancelAllRemaining: boolean;
  onTime: boolean;
  sessionsToCancel: number;
  /** Override paid detection (e.g. completed payment_transactions exists). */
  wasPaid?: boolean;
  /**
   * Completed (executed) sessions already used in this package.
   * A package with even one executed session is not refundable.
   */
  executedPackageSessions?: number;
}

export interface RefundEligibilityResult {
  eligible: boolean;
  eligibleAmount: number;
  currency: string;
  reason: string;
  reasonCode: 'unpaid' | 'late' | 'package_executed' | 'eligible' | 'zero_amount';
}

function parsePriceAmount(value: string | undefined | null): number {
  if (!value) return 0;
  const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function evaluateRefundEligibility(input: RefundEligibilityInput): RefundEligibilityResult {
  const { request, cancelAllRemaining, onTime, sessionsToCancel } = input;
  const currency = request.price_currency || 'USD';
  const totalPaid = parsePriceAmount(request.price_amount);
  const wasPaid = input.wasPaid ?? getClientRequestStatusValue(request) === 1;
  const packageSize = Math.max(1, request.num_sessions ?? 1);

  if (!wasPaid) {
    return {
      eligible: false,
      eligibleAmount: 0,
      currency,
      reason: 'No payment recorded for this session.',
      reasonCode: 'unpaid',
    };
  }

  const executedCount = Math.max(0, input.executedPackageSessions ?? 0);
  if (packageSize > 1 && executedCount >= 1) {
    return {
      eligible: false,
      eligibleAmount: 0,
      currency,
      reason: 'No refund is allowed for a package once any session has been completed.',
      reasonCode: 'package_executed',
    };
  }

  if (!onTime) {
    return {
      eligible: false,
      eligibleAmount: 0,
      currency,
      reason: 'Cancellation is less than 24 hours before the session; refund is not allowed.',
      reasonCode: 'late',
    };
  }

  const perSessionValue = totalPaid / packageSize;
  const eligibleAmount = Math.round(perSessionValue * sessionsToCancel * 100) / 100;

  return {
    eligible: eligibleAmount > 0,
    eligibleAmount,
    currency,
    reason: cancelAllRemaining
      ? `Pro-rata refund for ${sessionsToCancel} remaining session(s) in the package.`
      : 'Full refund for this session under default on-time cancellation rules.',
    reasonCode: eligibleAmount > 0 ? 'eligible' : 'zero_amount',
  };
}
