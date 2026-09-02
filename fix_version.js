const fs = require('fs');
let code = fs.readFileSync('android/app/build.gradle', 'utf8');

code = code.replace(/versionCode \d+/, 'versionCode 3');
code = code.replace(/versionName "[\d\.]+"/, 'versionName "1.1"');

fs.writeFileSync('android/app/build.gradle', code, 'utf8');
