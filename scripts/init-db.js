// Roda a criação do schema e o seed manualmente (opcional; o server já faz isso ao subir).
import { initSchema, pool } from '../db.js';
initSchema().then(() => { console.log('OK'); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
