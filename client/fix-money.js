const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else if (file.endsWith('.jsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('f:/BRANDUX/misio/client/src');
let changedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  if (file.includes('AdminSystemStats.jsx')) return;

  const newContent = content.replace(/\.toFixed\(2\)/g, ".toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })");
  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf8');
    changedCount++;
  }
});

console.log('Modified', changedCount, 'files');
