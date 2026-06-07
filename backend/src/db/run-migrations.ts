import dotenv from 'dotenv';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const dbConfig = DATABASE_URL
  ? {
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: true },
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'recruiter_os',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    };

async function runMigrations(): Promise<void> {
  const client = new pg.Client(dbConfig);

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Create a migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Read all .sql files from the migrations directory
    const migrationsDir = path.resolve(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    // Check which migrations have already been applied
    const { rows: applied } = await client.query(
      'SELECT name FROM _migrations ORDER BY id',
    );
    const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

    let ranCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`⏭️  Skipping (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      console.log(`🔄 Running: ${file} ...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log(`✅ Applied: ${file}`);
        ranCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        const message = err instanceof Error ? err.message : String(err);
        console.error(`❌ Failed: ${file} — ${message}`);
        throw err;
      }
    }

    if (ranCount === 0) {
      console.log('\n✅ Database is up to date — no new migrations to apply.');
    } else {
      console.log(`\n✅ Successfully applied ${ranCount} migration(s).`);
    }
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
