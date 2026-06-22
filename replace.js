const fs = require('fs');
const path = 'c:\\Users\\mezni\\Desktop\\PFE_Dynamix\\frontend-client\\src\\app\\entreprise\\entreprise-admin-dashboard\\entreprise-admin-dashboard.ts';
let content = fs.readFileSync(path, 'utf8');

const regex = /toggleMember\(id: string\) {[\s\S]*?this\.showToast[^\n]*\n\s*}/;
const newMethod = 	oggleMember(id: string) {
    const m = this.teamMembers().find(m => m.id === id);
    if (!m) return;
    const newState = !m.active;
    const statusStr = newState ? 'APPROVED' : 'SUSPENDED';

    this.http.patch(\\/users/\/status\, { status: statusStr }).subscribe({
      next: () => {
        this.teamMembers.update(list => list.map(item => item.id === id ? { ...item, active: newState } : item));
        this.showToast(\\ — \\, newState ? 'var(--green)' : '#64748b');
      },
      error: (err) => {
        this.showToast('Erreur lors du changement de statut', 'var(--red)');
        console.error(err);
      }
    });
  };

content = content.replace(regex, newMethod);
fs.writeFileSync(path, content, 'utf8');
console.log('Done replacement in TS');
