/*
 * The shapes the API returns (see the API's ProductResponseDto,
 * CategoryResponseDto and CategoryDetailDto). Only what the tools use.
 */

export interface CategorySummary {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  /** Decimal string, e.g. "129.90". */
  price: string;
  stock: number;
  isActive: boolean;
  categories: CategorySummary[];
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSummary {
  id: string;
  sku: string;
  name: string;
  price: string;
  isActive: boolean;
}

export interface CategoryDetail extends Category {
  products: ProductSummary[];
}

export interface Deleted {
  id: string;
}
