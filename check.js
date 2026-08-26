const https = require('https');
https.get('https://q-gambit.com', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const match = data.match(/_next\/static\/chunks\/app\/page-[a-z0-9]+\.js/g);
    if(match) {
        console.log('Fetching', match[0]);
        const jsUrl = 'https://q-gambit.com/' + match[0];
        https.get(jsUrl, (res2) => {
            let jsData = '';
            res2.on('data', chunk => jsData += chunk);
            res2.on('end', () => {
                if (jsData.includes('!=="black"')) {
                    console.log('NEW CODE IS DEPLOYED!');
                } else if (jsData.includes('==="black"')) {
                    console.log('OLD CODE DETECTED!');
                } else {
                    console.log('NEITHER FOUND IN PAGE CHUNK');
                }
            });
        });
    } else {
        console.log('No chunk found');
    }
  });
});
