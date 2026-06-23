require('dotenv').config({path:'.env.local'})
const https=require('https')
const {createClient}=require('@supabase/supabase-js')

const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
const S='73d40959-1920-4c68-a0f5-3684846b923f'

function fetch_wb(token,url){
  return new Promise((res,rej)=>{
    const opts=new URL(url)
    const req=https.get({hostname:opts.hostname,path:opts.pathname+opts.search,headers:{'Authorization':token}},r=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch{res([])}})
    })
    req.on('error',rej); req.setTimeout(120000,()=>{req.destroy();rej(new Error('timeout'))})
  })
}

async function run(){
  const {data:store}=await db.from('stores').select('wb_token').eq('id',S).limit(1)
  const token=store[0].wb_token
  
  console.log('Загружаем продажи с 2025-09-01 (flag=0)...')
  const sales=await fetch_wb(token,'https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=2025-09-01T00:00:00&flag=0')
  if(!Array.isArray(sales)){console.log('Ответ:',JSON.stringify(sales).slice(0,300));return}
  console.log('Получено от API:', sales.length)
  if(!sales.length) return
  
  // Статистика по месяцам из API
  const apiMonths={}
  for(const s of sales){const m=s.date?.slice(0,7);if(m)apiMonths[m]=(apiMonths[m]||0)+1}
  console.log('Распределение по месяцам из API:')
  for(const [m,c] of Object.entries(apiMonths).sort()) console.log(` ${m}: ${c}`)
  
  const rows=sales.map(s=>({
    store_id:S,
    g_number:s.gNumber,
    date:s.date,
    last_change_date:s.lastChangeDate,
    supplier_article:s.supplierArticle,
    nm_id:s.nmId,
    barcode:s.barcode,
    category:s.category,
    subject:s.subject,
    brand:s.brand,
    techsize:s.techSize,
    income_id:s.incomeID,
    total_price:s.totalPrice,
    discount_percent:s.discountPercent,
    is_supply:s.isSupply,
    is_realization:s.isRealization,
    sale_id:s.saleID,
    finished_price:s.finishedPrice,
    price_with_disc:s.priceWithDisc,
    spp:s.spp??null,
    payment_sale_amount:s.paymentSaleAmount??null,
    for_pay:s.forPay,
  }))
  
  let total=0
  for(let i=0;i<rows.length;i+=500){
    const {error}=await db.from('wb_sales').upsert(rows.slice(i,i+500),{onConflict:'sale_id',ignoreDuplicates:true})
    if(error) console.log('Upsert error:',error.message)
    else { total+=Math.min(500,rows.length-i); process.stdout.write('.') }
  }
  console.log('\nUpserted:', total, 'строк')
}
run().catch(e=>console.error('FATAL:',e.message))
