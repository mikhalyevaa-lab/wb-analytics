require('dotenv').config({path:'/Users/glazzki/Desktop/Claude_workspace/projects/wb-analytics/.env.local'})
const https=require('https')
const {createClient}=require('@supabase/supabase-js')

const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
const S='73d40959-1920-4c68-a0f5-3684846b923f'
const BATCH=20
const PAUSE=22000

function wait(ms){return new Promise(r=>setTimeout(r,ms))}

async function postFunnel(token,nmIds,start,end){
  const body=JSON.stringify({selectedPeriod:{start,end},nmIds,skipDeletedNm:false,aggregationLevel:'day'})
  return new Promise((res,rej)=>{
    const req=https.request({hostname:'seller-analytics-api.wildberries.ru',path:'/api/analytics/v3/sales-funnel/products/history',method:'POST',headers:{'Authorization':token,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d))}catch{res(d)} })
    })
    req.on('error',rej); req.setTimeout(30000,()=>{req.destroy();rej(new Error('timeout'))})
    req.write(body); req.end()
  })
}

function chunkArray(arr,size){const c=[];for(let i=0;i<arr.length;i+=size)c.push(arr.slice(i,i+size));return c}

function addDays(dateStr,n){const d=new Date(dateStr);d.setDate(d.getDate()+n);return d.toISOString().split('T')[0]}

async function run(){
  const {data:store}=await db.from('stores').select('wb_analytics_token,wb_token').eq('id',S).limit(1)
  const token=store[0].wb_analytics_token||store[0].wb_token
  
  const {data:prods}=await db.from('products').select('nm_id').eq('store_id',S).not('nm_id','is',null).limit(200)
  const nmIds=prods.map(p=>p.nm_id)
  console.log(`Загружаем воронку: ${nmIds.length} товаров, ${chunkArray(nmIds,BATCH).length} батчей/чанк`)
  
  // Год назад по квартально
  const today=new Date().toISOString().split('T')[0]
  const yearAgo=addDays(today,-364)
  
  // 30-дневные чанки
  const chunks=[]
  let cs=yearAgo
  while(cs<=today){
    const ce=addDays(cs,29)>today?today:addDays(cs,29)
    chunks.push({s:cs,e:ce})
    cs=addDays(ce,1)
  }
  console.log(`Чанков: ${chunks.length} (по 30 дней)`)
  
  const batches=chunkArray(nmIds,BATCH)
  let totalInserted=0
  
  for(let ci=0;ci<chunks.length;ci++){
    const {s,e}=chunks[ci]
    console.log(`\nЧанк ${ci+1}/${chunks.length}: ${s} — ${e}`)
    const items=[]
    
    for(let bi=0;bi<batches.length;bi++){
      if(bi>0) await wait(PAUSE)
      const batch=batches[bi]
      let retries=3
      while(retries>0){
        const r=await postFunnel(token,batch,s,e)
        if(r.status===429){console.log('  Rate limit, ждём 60с...'); await wait(60000); retries--;continue}
        if(r.title&&r.status!==200){console.log('  Error batch',bi,':',r.title); break}
        const rows=Array.isArray(r)?r:(r.data??[])
        items.push(...rows)
        console.log(`  Батч ${bi+1}/${batches.length}: ${rows.length} строк`)
        break
      }
    }
    
    if(!items.length){console.log('  Нет данных'); await wait(2000); continue}
    
    // Upsert
    const rows=items.map(it=>({
      store_id:S,nm_id:it.nmId,date:it.date,
      open_card_count:it.openCardCount??0,
      add_to_cart_count:it.addToCartCount??0,
      orders_count:it.ordersCount??0,
      orders_sum:it.ordersSumRub??0,
      buyouts_count:it.buyoutsCount??0,
      buyouts_sum:it.buyoutsSumRub??0,
      cancel_count:it.cancelCount??0,
      cancel_sum:it.cancelSumRub??0,
      avg_order_value:it.avgOrderSumRub??0,
      avg_buyout_value:it.avgBuyoutSumRub??0
    }))
    
    let ins=0
    for(let i=0;i<rows.length;i+=500){
      const {error}=await db.from('wb_funnel').upsert(rows.slice(i,i+500),{onConflict:'store_id,nm_id,date',ignoreDuplicates:false})
      if(error) console.log('  Upsert error:', error.message)
      else ins+=Math.min(500,rows.length-i)
    }
    totalInserted+=ins
    console.log(`  Upserted: ${ins} строк. Итого: ${totalInserted}`)
    await wait(2000)
  }
  
  console.log(`\n=== ГОТОВО: ${totalInserted} строк загружено ===`)
}
run().catch(e=>console.error('FATAL:',e.message))
