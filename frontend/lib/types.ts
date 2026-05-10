export interface Transaction {
  id: string;
  type: 'SALE' | 'RESTOCK';
  amount: number;
  reference: string;
  timestamp: string;
}

export interface OrderDensity {
  hour: string;
  count: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  threshold: number;
  unit: string;
}