import { useEffect, useState } from 'react';
import paymentRepository, { type PaymentRequest } from '@/features/payments/data/paymentRepository';

export function usePayment(id?: string) {
  const [payment, setPayment] = useState<PaymentRequest | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };
    paymentRepository.getPaymentRequest(id).then((result) => {
      if (active) setPayment(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);
  return { payment, loading, error };
}
