const fs = require('fs');
const path = 'c:/Users/mezni/Desktop/PFE_Dynamix/frontend-client/src/app/personal/personal-dashboard/components/overview-tab/overview-tab.scss';
let content = fs.readFileSync(path, 'utf8');

const marker = '/* Empty State */';
const firstIdx = content.indexOf(marker);
const secondIdx = content.indexOf(marker, firstIdx + 1);

if (firstIdx !== -1 && secondIdx !== -1) {
  // We have duplicate blocks before secondIdx
  // Keep everything up to the end of the first .btn-act / .mini-spin and empty-state, then jump to paas-list
  const paasMarker = '/* ══════════════════ PAAS INSTANCES LIST';
  const paasIdx = content.indexOf(paasMarker);
  if (paasIdx !== -1) {
    const cleanContent = content.substring(0, secondIdx) + content.substring(secondIdx);
    // Let's find duplicate .vm-specs-grid
    const firstSpecs = content.indexOf('/* Specs Grid */');
    const secondSpecs = content.indexOf('/* Specs Grid */', firstSpecs + 1);
    if (secondSpecs !== -1) {
      const before = content.substring(0, secondSpecs);
      const after = content.substring(paasIdx);
      const emptyStateBlock = `/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 12px;
  text-align: center;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
}

`;
      fs.writeFileSync(path, before + emptyStateBlock + after, 'utf8');
      console.log('Successfully cleaned overview-tab.scss!');
    }
  }
} else {
  console.log('No duplicate empty state found');
}
