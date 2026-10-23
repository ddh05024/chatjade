self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('push',e=>e.waitUntil((async()=>{
  let t='새 메시지',b='열어서 확인해 보세요';
  try{
    const c=await(await(await caches.open('cfg')).match('/cfg')).json();
    const d=await(await fetch(c.url+'/inbox?peek=1',{headers:{Authorization:'Bearer '+c.token}})).json();
    const i=d.items.at(-1);if(i){t=i.name;b=i.text;}
  }catch{}
  await self.registration.showNotification(t,{body:b,tag:'dm',icon:'icon.svg'});
})()));
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(l=>l[0]?l[0].focus():clients.openWindow('./')));});
