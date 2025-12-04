import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔄 Running database migrations...\n');

    // 创建迁移记录表（如果不存在）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 获取已执行的迁移
    const executed = await pool.query<{ name: string }>('SELECT name FROM _migrations');
    const executedSet = new Set(executed.rows.map(r => r.name));

    // 读取所有迁移文件
    const migrationsDir = join(__dirname, '../../db/migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // 按文件名排序：001_xxx.sql, 002_xxx.sql...

    let migratedCount = 0;

    for (const file of files) {
      if (executedSet.has(file)) {
        console.log(`⏭️  Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`📦 Running ${file}...`);
      
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      
      // 在事务中执行迁移
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ ${file} completed`);
        migratedCount++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    if (migratedCount === 0) {
      console.log('\n✨ Database is up to date, no migrations needed.');
    } else {
      console.log(`\n🎉 Successfully ran ${migratedCount} migration(s)!`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
