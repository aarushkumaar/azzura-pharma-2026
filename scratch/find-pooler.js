const dns = require('dns');

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

async function checkPoolers() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    try {
      const addresses = await new Promise((resolve, reject) => {
        dns.resolve4(host, (err, addr) => {
          if (err) reject(err);
          else resolve(addr);
        });
      });
      console.log(`Resolved pooler for region ${region}: ${host} -> ${addresses.join(', ')}`);
    } catch (err) {
      // Ignore failures
    }
  }
}

checkPoolers();
