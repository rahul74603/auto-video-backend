import { useEffect, useState } from 'react';
import productRepository, {
  type ProductListOptions,
  type ProductRecord,
} from '@/features/products/data/productRepository';

export function useProducts(options: ProductListOptions = {}) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const category = options.category;

  useEffect(() => {
    let active = true;
    productRepository
      .list({ category })
      .then((result) => {
        if (active) setProducts(result);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [category]);

  return { products, loading, error };
}
