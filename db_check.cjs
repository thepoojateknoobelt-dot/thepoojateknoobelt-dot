const pg = require('pg');
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:asif%40keshwani1234@35.154.73.173:5432/postgres?connect_timeout=10&sslmode=disable'
});

async function main() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'employees'
    `);
    console.log('Columns of employees table:');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await pool.end();
  }
}

main();
