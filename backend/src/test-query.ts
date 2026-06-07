import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const url = process.env.DATABASE_URL;

async function test() {
  console.log('Connecting to DATABASE_URL:', url);
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('Connected!');
    
    const page = 1;
    const limit = 20;
    const offset = 0;
    
    const baseCTE = `
      WITH job_cards AS (
        SELECT
          j.id,
          j.title,
          j.company,
          COALESCE(j.location, 'Remote')          AS location,
          COALESCE(best_ra.ats_score, 0)           AS "atsScore",
          CASE
            WHEN best_ra.has_sent_outreach          THEN 'applied'
            WHEN best_ra.has_outreach               THEN 'outreach'
            WHEN best_ra.ats_score IS NOT NULL       THEN 'optimize'
            WHEN best_ra.analysis_id IS NOT NULL     THEN 'analyze'
            ELSE 'discover'
          END                                       AS "pipelineStage",
          COALESCE(best_ra.last_action, 'Discovered') AS "lastAction",
          COALESCE(best_ra.last_action_at, j.created_at) AS "lastActionAt"
        FROM jobs j
        LEFT JOIN LATERAL (
          SELECT
            ra.id                                    AS analysis_id,
            ra.overall_score                         AS ats_score,
            CASE WHEN od_any.id IS NOT NULL THEN true ELSE false END AS has_outreach,
            CASE WHEN od_sent.id IS NOT NULL THEN true ELSE false END AS has_sent_outreach,
            CASE
              WHEN od_sent.id IS NOT NULL THEN 'Applied'
              WHEN od_any.id  IS NOT NULL THEN 'Outreach drafted'
              WHEN ra.overall_score IS NOT NULL THEN 'ATS optimized'
              ELSE 'Analyzed'
            END                                     AS last_action,
            GREATEST(ra.created_at, od_any.updated_at) AS last_action_at
          FROM resume_analyses ra
          LEFT JOIN LATERAL (
            SELECT id, updated_at FROM outreach_drafts
            WHERE resume_analysis_id = ra.id
            ORDER BY updated_at DESC LIMIT 1
          ) od_any ON true
          LEFT JOIN LATERAL (
            SELECT id FROM outreach_drafts
            WHERE resume_analysis_id = ra.id AND status = 'sent'
            ORDER BY updated_at DESC LIMIT 1
          ) od_sent ON true
          WHERE ra.job_listing_id = j.id
          ORDER BY ra.overall_score DESC NULLS LAST
          LIMIT 1
        ) best_ra ON true
      )`;

    const countQuery = `${baseCTE} SELECT COUNT(*)::text AS total FROM job_cards`;
    const countResult = await client.query(countQuery);
    console.log('Count query result:', countResult.rows);

    const dataQuery = `
      ${baseCTE}
      SELECT * FROM job_cards
      ORDER BY "lastActionAt" DESC
      LIMIT $1 OFFSET $2`;
    
    const dataResult = await client.query(dataQuery, [limit, offset]);
    console.log('Data query success! Row count:', dataResult.rows.length);

  } catch (err) {
    console.error('Error executing queries:', err);
  } finally {
    await client.end();
  }
}

test();
