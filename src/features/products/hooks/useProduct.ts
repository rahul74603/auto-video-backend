import { useEffect, useState } from 'react';
import productRepository, {
  type ProductRecord,
} from '@/features/products/data/productRepository';

export function useProduct(id?: string) {
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };

    productRepository
      .getById(id)
      .then((result) => {
        if (active) setProduct(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  return { product, loading, error };
}
