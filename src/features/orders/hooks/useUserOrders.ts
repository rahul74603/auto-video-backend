import { useEffect, useState } from 'react';
import orderRepository, {
  type OrderRecord,
  type OrderStatus,
} from '@/features/orders/data/orderRepository';

export function useUserOrders(userId?: string, status?: OrderStatus) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };
    orderRepository.listByUser(userId, status).then((result) => {
      if (active) setOrders(result);
    }).catch((reason) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [userId, status]);

  return { orders, loading, error };
}
