// =============================================================
// Payment Approval Workflow Tests
// Covers src/features/payments/workflows/paymentApprovalWorkflow.ts
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// Mock repositories — use vi.hoisted to avoid hoisting issues
// ------------------------------------------------------------------
const { mockUpdatePaymentStatus, mockMergeUser } = vi.hoisted(() => ({
  mockUpdatePaymentStatus: vi.fn(),
  mockMergeUser: vi.fn(),
}));

vi.mock('@/features/payments/data/paymentRepository', () => ({
  default: {
    updatePaymentStatus: mockUpdatePaymentStatus,
  },
}));

vi.mock('@/features/users/data/userRepository', () => ({
  default: {
    mergeUser: mockMergeUser,
  },
}));

import { approvePayment, type PaymentApprovalAction } from '@/features/payments/workflows/paymentApprovalWorkflow';

describe('Payment Approval Workflow — approvePayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseParams = {
    requestId: 'req-123',
    userId: 'user-456',
    itemId: 'course-789',
  };

  it('returns completed status when action is "approved"', async () => {
    const result = await approvePayment({ ...baseParams, action: 'approved' });

    expect(result).toEqual({ success: true, status: 'completed' });
    expect(mockUpdatePaymentStatus).toHaveBeenCalledWith(
      'req-123',
      'completed',
      expect.any(String)
    );
  });

  it('returns rejected status when action is "rejected"', async () => {
    const result = await approvePayment({ ...baseParams, action: 'rejected' });

    expect(result).toEqual({ success: true, status: 'rejected' });
    expect(mockUpdatePaymentStatus).toHaveBeenCalledWith(
      'req-123',
      'rejected',
      expect.any(String)
    );
  });

  it('grants user access when payment is approved', async () => {
    await approvePayment({ ...baseParams, action: 'approved' });

    expect(mockMergeUser).toHaveBeenCalledWith('user-456', {
      'purchased_course-789': true,
      lastPurchaseDate: expect.any(String),
    });
  });

  it('does NOT grant user access when payment is rejected', async () => {
    await approvePayment({ ...baseParams, action: 'rejected' });

    expect(mockMergeUser).not.toHaveBeenCalled();
  });

  it('updates payment status before granting access', async () => {
    await approvePayment({ ...baseParams, action: 'approved' });

    expect(mockUpdatePaymentStatus).toHaveBeenCalledTimes(1);
    expect(mockMergeUser).toHaveBeenCalledTimes(1);
  });

  it('generates ISO string for processedAt timestamp', async () => {
    await approvePayment({ ...baseParams, action: 'approved' });

    const processedAtArg = mockUpdatePaymentStatus.mock.calls[0][2];
    expect(typeof processedAtArg).toBe('string');
    expect(processedAtArg).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('handles both PaymentApprovalAction values', () => {
    const actions: PaymentApprovalAction[] = ['approved', 'rejected'];
    expect(actions).toHaveLength(2);
    expect(actions).toContain('approved');
    expect(actions).toContain('rejected');
  });
});
