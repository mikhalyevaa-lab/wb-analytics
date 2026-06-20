export interface ManualCost {
  id: string
  store_id: string
  date: string
  category: 'salary' | 'rent' | 'tax' | 'loan' | 'other'
  description: string | null
  amount: number
}

export const CATEGORY_LABELS: Record<string, string> = {
  salary: 'ФОТ',
  rent: 'Аренда',
  tax: 'Налоги',
  loan: 'Кредит',
  other: 'Прочее',
}
