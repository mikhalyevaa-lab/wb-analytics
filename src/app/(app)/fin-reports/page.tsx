import { redirect } from 'next/navigation'

// Раздел объединён с /reports (Умная таблица источников)
export default function FinReportsRedirect() {
  redirect('/reports')
}
