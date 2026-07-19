import { useEffect, useState } from 'react';
import orderRepository, {
  type OrderRecord,
  type OrderStatus,
} from '@/features/orders/data/orderRepository';

export function useOrders(status?: OrderStatus) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    const request = status
      ? orderRepository.listByStatus(status)
      : Promise.resolve([] as OrderRecord[]);
    request.then((result) => {
      if (active) setOrders(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [status]);

  return { orders, loading, error };
}
