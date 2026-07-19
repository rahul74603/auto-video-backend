import paymentRepository from '@/features/payments/data/paymentRepository';
import userRepository from '@/features/users/data/userRepository';

export type PaymentApprovalAction = 'approved' | 'rejected';

export async function approvePayment({
  requestId,
  userId,
  itemId,
  action,
}: {
  requestId: string;
  userId: string;
  itemId: string;
  action: PaymentApprovalAction;
}): Promise<{ success: true; status: 'completed' | 'rejected' }> {
  const status = action === 'approved' ? 'completed' : 'rejected';
  const processedAt = new Date().toISOString();

  await paymentRepository.updatePaymentStatus(requestId, status, processedAt);

  if (status === 'completed') {
    await userRepository.mergeUser(userId, {
      [`purchased_${itemId}`]: true,
      lastPurchaseDate: processedAt,
    });
  }

  return { success: true, status };
}
