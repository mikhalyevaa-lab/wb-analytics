require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const S = '73d40959-1920-4c68-a0f5-3684846b923f'

const FILE = {
  '01': { cnt: 14582, sum: 29259482 },
  '02': { cnt: 13842, sum: 29404243 },
  '03': { cnt: 17157, sum: 37312018 },
  '04': { cnt: 10086, sum: 19473405 },
  '05': { cnt: 11791, sum: 20487160 },
  '06': { cnt:  6059, sum: 10486904 },
}

async function run() {
  const { data: sample } = await db.from('wb_sales')
    .select('price_with_disc,for_pay,finished_price')
    .eq('store_id', S).like('sale_id', 'S%')
    .gte('date', '2026-06-20').limit(3)
  console.log('Примеры price_with_disc:', sample?.map(r => r.price_with_disc))

  console.log('\n=== СВЕРКА wb_sales vs Файл (только S...) ===')
  let totC = 0, totS = 0, totFC = 0, totFS = 0
  for (const m of ['06','05','04','03','02','01']) {
    const dateFrom = `2026-${m}-01`
    const lastDay = new Date(2026, parseInt(m), 0).getDate()
    const dateTo = `2026-${m}-${String(lastDay).padStart(2,'0')}T23:59:59`
    let all = [], from = 0
    while (true) {
      const { data } = await db.from('wb_sales')
        .select('price_with_disc')
        .eq('store_id', S).like('sale_id', 'S%')
        .gte('date', dateFrom).lte('date', dateTo)
        .range(from, from + 999)
      if (!data?.length) break
      all.push(...data); if (data.length < 1000) break; from += 1000
    }
    const cnt = all.length
    const sum = all.reduce((s, r) => s + (r.price_with_disc ?? 0), 0)
    const f = FILE[m]
    const dc = ((cnt - f.cnt) / f.cnt * 100).toFixed(2)
    const ds = ((sum - f.sum) / f.sum * 100).toFixed(2)
    const okC = Math.abs(cnt - f.cnt) / f.cnt * 100 <= 0.5
    const okS = Math.abs(sum - f.sum) / f.sum * 100 <= 0.5
    console.log(`2026-${m}: ${cnt} шт (Δ${dc}% ${okC?'✅':'❌'}) | ${Math.round(sum).toLocaleString('ru')} руб (Δ${ds}% ${okS?'✅':'❌'})  [файл: ${f.cnt} / ${f.sum.toLocaleString('ru')}]`)
    totC += cnt; totS += sum; totFC += f.cnt; totFS += f.sum
  }
  const okTC = Math.abs(totC - totFC) / totFC * 100 <= 0.5
  const okTS = Math.abs(totS - totFS) / totFS * 100 <= 0.5
  console.log(`\nИТОГО БД: ${totC} шт (Δ${((totC-totFC)/totFC*100).toFixed(2)}% ${okTC?'✅':'❌'}) | ${Math.round(totS).toLocaleString('ru')} руб (Δ${((totS-totFS)/totFS*100).toFixed(2)}% ${okTS?'✅':'❌'})`)
  console.log(`Файл:      ${totFC} шт | ${totFS.toLocaleString('ru')} руб`)
}
run().catch(console.error)
