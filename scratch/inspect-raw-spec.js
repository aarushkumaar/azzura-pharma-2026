const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5';

async function test() {
  const url = `${SUPABASE_URL}/rest/v1/`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  console.log('Status:', res.status);
  const spec = await res.json();
  console.log('Keys of body:', Object.keys(spec));
  if (spec.definitions) {
    console.log('Definitions keys:', Object.keys(spec.definitions));
    console.log('orders definition:', spec.definitions.orders);
    console.log('products definition:', spec.definitions.products);
  }
}

test();
