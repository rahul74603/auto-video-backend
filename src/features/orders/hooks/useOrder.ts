import { useEffect, useState } from 'react';
import orderRepository, {
  type OrderRecord,
} from '@/features/orders/data/orderRepository';

export function useOrder(id?: string) {
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };
    orderRepository.getById(id).then((result) => {
      if (active) setOrder(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  return { order, loading, error };
}
