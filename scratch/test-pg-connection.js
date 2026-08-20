const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres:sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5@db.ilduyhuvpiqhvbnocqxf.supabase.co:5432/postgres'
});

async function testPg() {
  console.log('Connecting to PostgreSQL database...');
  try {
    await client.connect();
    console.log('PG Connection Success!');
    const res = await client.query('SELECT COUNT(*) FROM products');
    console.log('Products Count:', res.rows[0].count);
    await client.end();
  } catch (err) {
    console.error('PG Connection Failed:', err.message);
  }
}

testPg();
