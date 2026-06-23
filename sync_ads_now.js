require('dotenv').config({path:'.env.local'})
const https=require('https')
const {createClient}=require('@supabase/supabase-js')
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
const S='73d40959-1920-4c68-a0f5-3684846b923f'

function get(token,url){
  return new Promise((res,rej)=>{
    const u=new URL(url)
    const req=https.get({hostname:u.hostname,path:u.pathname+u.search,headers:{'Authorization':token}},r=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})
    })
    req.on('error',rej); req.setTimeout(30000,()=>{req.destroy();rej(new Error('timeout'))})
  })
}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}

async function run(){
  const {data:store}=await db.from('stores').select('wb_token').eq('id',S).limit(1)
  const token=store[0].wb_token
  const ADV='https://advert-api.wildberries.ru'

  // Список кампаний
  const count=await get(token,`${ADV}/adv/v1/promotion/count`)
  const campaigns=(count?.adverts??[]).flatMap(g=>g.advertList??[])
  console.log('Кампаний:', campaigns.length)
  if(!campaigns.length) return

  const now=new Date(Date.now()+3*60*60*1000)
  const endDate=now.toISOString().split('T')[0]
  const beginDate=new Date(now.getTime()-6*86400000).toISOString().split('T')[0]
  console.log('Период:', beginDate, '—', endDate)

  const ids=campaigns.map(c=>c.advertId)
  const names=Object.fromEntries(campaigns.map(c=>[c.advertId,c.name]))
  let total=0

  for(let i=0;i<ids.length;i+=50){
    if(i>0){console.log('Пауза 20с...');await wait(20000)}
    const batch=ids.slice(i,i+50)
    const stats=await get(token,`${ADV}/adv/v3/fullstats?ids=${batch.join(',')}&beginDate=${beginDate}&endDate=${endDate}`)
    if(!Array.isArray(stats)){console.log('Error batch',i,':',JSON.stringify(stats).slice(0,150));continue}
    console.log(`Батч ${Math.floor(i/50)+1}: ${stats.length} кампаний`)
    for(const camp of stats){
      for(const day of (camp.days??[])){
        const date=day.date?.split('T')[0]
        if(!date) continue
        const {error}=await db.from('wb_ad_spend').upsert({
          store_id:S,campaign_id:camp.advertId,
          campaign_name:names[camp.advertId]??String(camp.advertId),
          date,views:day.views??0,clicks:day.clicks??0,
          spend:day.sum??0,orders_count:day.orders??0,orders_sum:day.sum_price??0
        },{onConflict:'store_id,campaign_id,date'})
        if(error) console.log('Upsert error:',error.message)
        else total++
      }
    }
  }
  console.log('Готово! Записей:', total)
  const {data:last}=await db.from('wb_ad_spend').select('date,spend').eq('store_id',S).order('date',{ascending:false}).limit(3)
  console.log('Последние записи:',last?.map(r=>r.date+'='+r.spend+'₽').join(', '))
}
run().catch(e=>console.error('FATAL:',e.message))
