const { Client } = require('pg');

const regions = [
  'ap-south-1',     // Mumbai
  'ap-southeast-1', // Singapore
  'ap-southeast-2', // Sydney
  'ap-northeast-1', // Tokyo
  'ap-northeast-2', // Seoul
  'us-east-1',      // N. Virginia
  'us-east-2',      // Ohio
  'us-west-1',      // N. California
  'us-west-2',      // Oregon
  'eu-central-1',   // Frankfurt
  'eu-west-1',      // Ireland
  'eu-west-2',      // London
  'eu-west-3',      // Paris
  'eu-north-1',     // Stockholm
  'sa-east-1',      // São Paulo
  'ca-central-1'    // Canada Central
];

async function findRegion() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const client = new Client({
      host: host,
      port: 6543,
      user: 'postgres.ilduyhuvpiqhvbnocqxf',
      password: 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5',
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      await client.connect();
      console.log(`\nSUCCESS! Connected to pooler in region: ${region}`);
      const res = await client.query('SELECT current_database(), current_schema()');
      console.log('QueryResult:', res.rows[0]);
      
      const countRes = await client.query('SELECT COUNT(*) FROM products');
      console.log('Products Count:', countRes.rows[0].count);
      
      await client.end();
      return host; // Found it!
    } catch (err) {
      // Just log/ignore and try next
      console.log(`Region ${region} failed:`, err.message);
    }
  }
  console.log('\nCould not connect to any regional pooler.');
  return null;
}

findRegion();
