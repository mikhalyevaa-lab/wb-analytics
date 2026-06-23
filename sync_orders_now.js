require('dotenv').config({path:'.env.local'})
const https=require('https')
const {createClient}=require('@supabase/supabase-js')
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
const S='73d40959-1920-4c68-a0f5-3684846b923f'

function fetchWB(token,url){
  return new Promise((res,rej)=>{
    const u=new URL(url)
    const req=https.get({hostname:u.hostname,path:u.pathname+u.search,headers:{'Authorization':token}},r=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch{res([])}})
    })
    req.on('error',rej); req.setTimeout(60000,()=>{req.destroy();rej(new Error('timeout'))})
  })
}

async function run(){
  const {data:store}=await db.from('stores').select('wb_token').eq('id',S).limit(1)
  const token=store[0].wb_token
  const from=new Date(); from.setDate(from.getDate()-7)
  const dateFrom=from.toISOString().split('T')[0]+'T00:00:00'
  console.log('Загружаем заказы с',dateFrom)
  const orders=await fetchWB(token,'https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom='+dateFrom+'&flag=0')
  if(!Array.isArray(orders)){console.log('Error:',JSON.stringify(orders).slice(0,200));return}
  console.log('Получено:',orders.length,'заказов')
  
  // Проверяем какие колонки есть
  const {data:sample}=await db.from('wb_orders').select('*').limit(1)
  const cols=Object.keys(sample?.[0]??{})
  console.log('Колонки в таблице:',cols.join(', '))
  
  // Дедупликация по уникальному ключу (берём последний lastChangeDate)
const seen=new Map()
for(const o of orders){
  const k=`${o.gNumber}|${o.nmId}|${o.barcode}|${o.date?.slice(0,10)}`
  if(!seen.has(k)||o.lastChangeDate>seen.get(k).lastChangeDate) seen.set(k,o)
}
const uniq=[...seen.values()]
console.log("После дедупликации:",uniq.length,"уникальных заказов")
const rows=uniq.map(o=>{
    const r={store_id:S,g_number:o.gNumber,date:o.date,last_change_date:o.lastChangeDate,
      supplier_article:o.supplierArticle,nm_id:o.nmId,barcode:o.barcode,
      category:o.category,subject:o.subject,brand:o.brand,techsize:o.techSize,
      income_id:o.incomeID,total_price:o.totalPrice,discount_percent:o.discountPercent,
      is_supply:o.isSupply,is_realization:o.isRealization,
      price_after_discount:o.priceWithDiscount??null,
      is_cancel:o.isCancel??false,cancel_dt:o.cancelDate??null,
      srid:o.srid??null}
    // Добавляем только существующие колонки
    if(cols.includes('order_type')) r.order_type=o.orderType??null
    if(cols.includes('warehouse_name')) r.warehouse_name=o.warehouseName??null
    if(cols.includes('oblast_okrug_name')) r.oblast_okrug_name=o.oblastOkrugName??null
    if(cols.includes('region_name')) r.region_name=o.regionName??null
    return r
  })
  
  let ok=0
  for(let i=0;i<rows.length;i+=500){
    const {error}=await db.from('wb_orders').upsert(rows.slice(i,i+500),{onConflict:'store_id,g_number,nm_id,barcode,date',ignoreDuplicates:false})
    if(error){console.log('Error chunk',i,':',error.message);break}
    else ok+=Math.min(500,rows.length-i)
    process.stdout.write('.')
  }
  console.log('\nUpserted:',ok,'заказов')
  const {data:last}=await db.from('wb_orders').select('date').eq('store_id',S).order('date',{ascending:false}).limit(1)
  console.log('Последний заказ:',last?.[0]?.date?.slice(0,16))
}
run().catch(e=>console.error('FATAL:',e.message))
