import { useEffect, useState } from 'react';
import paymentRepository, { type PaymentRequest } from '@/features/payments/data/paymentRepository';

export function usePayments(userId?: string) {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };
    paymentRepository.listUserPaymentRequests(userId).then((result) => {
      if (active) setPayments(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [userId]);
  return { payments, loading, error };
}
