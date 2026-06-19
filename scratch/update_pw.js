import bcrypt from 'bcryptjs';
import pg from 'pg';

const hash = bcrypt.hashSync('123456', 10);
console.log('Generated Hash:', hash);

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:asif%40keshwani1234@35.154.73.173:5432/postgres?connect_timeout=10&sslmode=disable'
});

pool.query(
  'UPDATE users SET password = $1 WHERE id = $2 OR username = $3',
  [hash, 'admin_user', 'admin'],
  (err, res) => {
    if (err) {
      console.error('Database Update Error:', err);
    } else {
      console.log('Successfully updated rows:', res.rowCount);
    }
    pool.end();
  }
);
