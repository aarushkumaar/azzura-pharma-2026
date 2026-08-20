const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

async function getOpenApi() {
  const url = `${SUPABASE_URL}/rest/v1/`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    const spec = await res.json();
    
    const schemas = spec.components ? spec.components.schemas : spec.definitions;
    if (!schemas) {
      console.log('Could not find schemas in spec. Keys:', Object.keys(spec));
      return;
    }

    const paths = ['products', 'orders', 'customers', 'notify_me_requests'];
    for (const path of paths) {
      console.log(`\n=== Definition for ${path} ===`);
      const def = schemas[path];
      if (!def) {
        console.log('Not defined in schemas.');
        continue;
      }
      for (const [propName, propVal] of Object.entries(def.properties || {})) {
        console.log(`  - ${propName}: type = ${propVal.type}, format = ${propVal.format || 'none'}, description = ${propVal.description || ''}`);
      }
    }
  } catch (err) {
    console.error('Error fetching OpenAPI spec:', err);
  }
}

getOpenApi();
