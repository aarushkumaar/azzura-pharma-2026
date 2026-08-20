const dns = require('dns');

dns.lookup('db.ilduyhuvpiqhvbnocqxf.supabase.co', { all: true }, (err, addresses) => {
  if (err) {
    console.error('dns.lookup error:', err);
  } else {
    console.log('dns.lookup addresses:', addresses);
  }
});

dns.resolve6('db.ilduyhuvpiqhvbnocqxf.supabase.co', (err, addresses) => {
  if (err) {
    console.error('dns.resolve6 error:', err);
  } else {
    console.log('dns.resolve6 addresses:', addresses);
  }
});

dns.resolve4('db.ilduyhuvpiqhvbnocqxf.supabase.co', (err, addresses) => {
  if (err) {
    console.error('dns.resolve4 error:', err);
  } else {
    console.log('dns.resolve4 addresses:', addresses);
  }
});
