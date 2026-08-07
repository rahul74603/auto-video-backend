const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.github', 'workflows');
for (const file of fs.readdirSync(dir).filter(f=>f.endsWith('.yml'))) {
  const fp = path.join(dir, file);
  let c = fs.readFileSync(fp, 'utf8');
  if (!c.includes('Check Automation Switch')) continue;
  if (c.includes('firebase-admin') && c.includes('npm install')) {
    console.log(`OK ${file}`);
    continue;
  }
  console.log(`Fixing ${file}`);
  c = c.replace(
    /run: \|\n\s+node check_automation\.js/,
    'run: |\n          npm install --ignore-scripts --legacy-peer-deps firebase-admin axios 2>&1 | tail -n 3 || true\n          node check_automation.js'
  );
  fs.writeFileSync(fp, c, 'utf8');
}
console.log('Done — now commit and push workflows');
