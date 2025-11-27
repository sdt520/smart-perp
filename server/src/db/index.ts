import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://smartperp:smartperp123@localhost:5432/smartperp',
});

// Test connection
pool.on('connect', () => {
  console.log('📦 Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const db = {
  query: <T>(text: string, params?: unknown[]) => pool.query<T>(text, params),
  getClient: () => pool.connect(),
};

export default db;

