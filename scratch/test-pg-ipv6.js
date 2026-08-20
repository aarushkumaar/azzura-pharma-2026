const { Client } = require('pg');

const client = new Client({
  host: '2406:da1a:b00:1301:4676:b8bf:f54:8e83',
  port: 5432,
  user: 'postgres',
  password: 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function testPg() {
  console.log('Connecting to PostgreSQL database via IPv6...');
  try {
    await client.connect();
    console.log('PG Connection Success!');
    const res = await client.query('SELECT COUNT(*) FROM products');
    console.log('Products Count:', res.rows[0].count);
    await client.end();
  } catch (err) {
    console.error('PG Connection Failed:', err.message, err.stack);
  }
}

testPg();
