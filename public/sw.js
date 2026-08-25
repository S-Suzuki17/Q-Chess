self.addEventListener('install', (e) => { 
    self.skipWaiting(); 
}); 

self.addEventListener('activate', (e) => { 
    e.waitUntil(
        self.clients.claim().then(() => { 
            return self.registration.unregister(); 
        }).then(() => {
            return self.clients.matchAll({ type: 'window' });
        }).then((windowClients) => {
            for (let client of windowClients) {
                client.navigate(client.url);
            }
        })
    ); 
});
