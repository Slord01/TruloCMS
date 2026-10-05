const readline = require('node:readline/promises');
const { openStore, createSuperuser } = require('./store.cjs');
(async () => {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const db = openStore();
  try {
    const email = process.env.CMS_ADMIN_EMAIL || await prompt.question('Superuser email: ');
    const password = process.env.CMS_ADMIN_PASSWORD || await prompt.question('New password (12+ characters; input is visible): ');
    createSuperuser(db, email, password);
    console.log('Superuser created. No default accounts or passwords are installed.');
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  } finally { db.close(); prompt.close(); }
})();
