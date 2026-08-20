const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const candidateColumns = {
  products: [
    'id', 'name', 'category', 'need_tags', 'price', 'compare_price', 'rating',
    'review_count', 'description', 'is_new_release', 'is_featured', 'stock_quantity',
    'image_url', 'created_at', 'series', 'flavour', 'net_weight', 'image_folder',
    'tags', 'short_description', 'benefits', 'ingredients', 'how_to_use',
    'nutrition_facts', 'warnings', 'in_stock', 'price_inr', 'images'
  ]
};

async function probe() {
  for (const [table, cols] of Object.entries(candidateColumns)) {
    console.log(`\nProbing table: ${table}`);
    for (const col of cols) {
      const { error } = await supabase.from(table).select(col).limit(1);
      if (error) {
        console.log(`  - ${col}: Error - ${error.message} (code: ${error.code || ''})`);
      } else {
        console.log(`  - ${col}: EXISTS`);
      }
    }
  }
}

probe();
