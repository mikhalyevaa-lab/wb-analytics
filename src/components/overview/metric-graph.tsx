'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { METRIC_GRAPH, METRIC_GRAPH_ORDER, type MetricId } from '@/lib/metricGraph'

export interface MetricValue {
  value: string
  delta: string
  tone: 'up' | 'warn' | 'down'
  note: string
}

interface MetricGraphProps {
  values: Record<MetricId, MetricValue>
  periodQuery: string
}

const TONE_COLOR = { up: 'var(--app-positive)', warn: 'var(--app-warn)', down: 'var(--app-risk)' }

/** Компонент «Граф связей» — клик по узлу подсвечивает зависимые, справа разбор (Ф3 редизайна Steep) */
export function MetricGraph({ values, periodQuery }: MetricGraphProps) {
  const router = useRouter()
  const [sel, setSel] = useState<MetricId>('profit')
  const node = METRIC_GRAPH[sel]
  const val = values[sel]

  function goToSection() {
    router.push(`${node.href}${periodQuery ? `?${periodQuery}` : ''}`)
  }

  return (
    <div style={{ background: 'var(--app-white)', borderRadius: 'var(--app-radius-card)', boxShadow: 'var(--app-shadow-card)', padding: 28 }}>
      <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-7">
        {/* Формула прибыли — узлы */}
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--app-graphite)' }}>Формула прибыли</div>
          <div className="flex flex-wrap gap-2.5">
            {METRIC_GRAPH_ORDER.map(id => {
              const n = METRIC_GRAPH[id]
              const v = values[id]
              const active = id === sel
              const related = node.dependsOn.includes(id) || node.affects.includes(id)
              const bg = active ? 'var(--app-cta-bg)' : related ? 'var(--app-apricot-wash)' : 'var(--app-white)'
              const color = active ? 'var(--app-cta-text)' : related ? 'var(--app-rust)' : 'var(--app-text)'
              const border = active ? 'var(--app-cta-bg)' : related ? '#f0cdb8' : '#dfe0e3'
              return (
                <button
                  key={id}
                  onClick={() => setSel(id)}
                  className="text-left transition-all"
                  style={{ flex: '1 1 130px', border: `1px solid ${border}`, background: bg, color, borderRadius: 16, padding: '14px 16px' }}
                >
                  <span className="block text-[14px] font-medium leading-tight">{n.label}</span>
                  <span className="block text-[13px] mt-0.5" style={{ opacity: .8 }}>{v?.value ?? '—'}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-5 pt-4 text-[15px] leading-relaxed" style={{ borderTop: '1px solid #ededef', color: 'var(--app-ash)' }}>
            <div className="font-semibold mb-1" style={{ color: 'var(--app-text)' }}>Цепочка</div>
            Заказы питаются <b style={{ color: 'var(--app-rust)' }}>рекламой</b> → формируют <b style={{ color: 'var(--app-text)' }}>выручку</b> (с поправкой на <b style={{ color: 'var(--app-text)' }}>выкуп</b> и <b style={{ color: 'var(--app-rust)' }}>возвраты</b>) → после удержаний остаётся <b style={{ color: 'var(--app-rust)' }}>прибыль</b>. Заказы же расходуют <b style={{ color: 'var(--app-rust)' }}>запасы</b>.
          </div>
        </div>

        {/* Панель разбора выбранного узла */}
        <div style={{ background: 'var(--app-fog)', borderRadius: 20, padding: 24 }}>
          <div className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--app-graphite)' }}>Показатель</div>
          <div style={{ fontFamily: 'var(--app-font-serif)', fontSize: 26, marginTop: 6, color: 'var(--app-text)' }}>{node.label}</div>
          <div className="flex items-baseline gap-3 mt-1">
            <span style={{ fontFamily: 'var(--app-font-serif)', fontSize: 34, color: 'var(--app-text)' }}>{val?.value ?? '—'}</span>
            <span className="text-[15px] font-medium" style={{ color: TONE_COLOR[val?.tone ?? 'up'] }}>{val?.delta}</span>
          </div>
          <p className="text-[15px] mt-3.5" style={{ color: 'var(--app-ash)' }}>{val?.note}</p>

          {node.dependsOn.length > 0 && (
            <div className="mt-4.5">
              <div className="text-[13px] font-medium mb-2" style={{ color: 'var(--app-graphite)' }}>Зависит от</div>
              <div className="flex flex-wrap gap-2">
                {node.dependsOn.map(id => (
                  <button key={id} onClick={() => setSel(id)} className="text-[14px] font-medium rounded-full px-3.5 py-1.5"
                    style={{ background: 'var(--app-white)', border: '1px solid var(--app-dove)', color: 'var(--app-text)' }}>
                    {METRIC_GRAPH[id].label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {node.affects.length > 0 && (
            <div className="mt-3.5">
              <div className="text-[13px] font-medium mb-2" style={{ color: 'var(--app-graphite)' }}>Влияет на</div>
              <div className="flex flex-wrap gap-2">
                {node.affects.map(id => (
                  <button key={id} onClick={() => setSel(id)} className="text-[14px] font-medium rounded-full px-3.5 py-1.5"
                    style={{ background: 'var(--app-white)', border: '1px solid var(--app-dove)', color: 'var(--app-text)' }}>
                    {METRIC_GRAPH[id].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={goToSection}
            className="inline-flex items-center gap-2 mt-5 text-[15px] font-medium rounded-full px-5 py-2.5"
            style={{ background: 'var(--app-cta-bg)', color: 'var(--app-cta-text)' }}
          >
            Открыть раздел «{node.section}»
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="var(--app-cta-text)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
