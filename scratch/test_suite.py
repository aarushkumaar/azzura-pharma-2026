import urllib.request
import json
import os
import re

SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co'
ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg'
SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDgxMzE1NSwiZXhwIjoyMDk2Mzg5MTU1fQ.lRmzrwiuc2oxFTyDepwrLxSI2sYDQShQe3HNLsEhd9w'

def fetch_products():
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/products?select=*&order=is_featured.desc,name.asc', headers={
        'apikey': ANON_KEY,
        'Authorization': f'Bearer {ANON_KEY}',
        'Accept': 'application/json'
    })
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

def fetch_featured_products():
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/products?select=*&is_featured=eq.true&order=name.asc&limit=6', headers={
        'apikey': ANON_KEY,
        'Authorization': f'Bearer {ANON_KEY}',
        'Accept': 'application/json'
    })
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

def insert_product(payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/products', data=data, method='POST', headers={
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Prefer': 'return=representation'
    })
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

def delete_product(pid):
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/products?id=eq.{pid}', method='DELETE', headers={
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Accept': 'application/json',
        'Prefer': 'return=representation'
    })
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

def run_tests():
    print('====================================================')
    print('TEST 1: CHARACTER ENCODING & ICON VERIFICATION')
    print('====================================================')
    files_to_check = [
        'about.html', 'cart.html', 'checkout.html', 'contact.html', 'events.html',
        'index.html', 'product-detail.html', 'product-essential-immuno-plus.html',
        'product-essential-renaprotein.html', 'productss.html', 'science.html', 'admin.html'
    ]
    for f in files_to_check:
        with open(f, 'rb') as fp:
            raw = fp.read()
        assert b'\xef\xbf\xbd' not in raw, f'Found replacement char in {f}'
        text = raw.decode('utf-8')
        # Check no corrupted ?? placeholder strings exist in HTML tags/text
        for lno, line in enumerate(text.splitlines(), 1):
            if '??' in line and not any(k in line for k in [' ?? ', '?? null', '?? false', '?? 0', '?? []', '?? {}', '?? true', '?? (', '?? \'', '?? "']):
                raise AssertionError(f'Suspicious ?? in {f}:{lno}: {line}')

    print('PASS: All HTML files are 100% valid UTF-8 with zero replacement characters!')

    with open('index.html', 'r', encoding='utf-8') as fp:
        idx = fp.read()
    assert '🔬' in idx and 'Research Driven' in idx
    assert '🌐' in idx and 'Global Reach' in idx
    assert '💙' in idx and 'Human First' in idx
    assert 'Sky Blue — protecting everyone' in idx
    print('PASS: Verified feature cards (🔬 Research Driven, 🌐 Global Reach, 💙 Human First) and Sky Blue em-dash.')

    print('\n====================================================')
    print('TEST 2: EMPTY PRODUCTS STATE VERIFICATION')
    print('====================================================')
    initial_products = fetch_products()
    print(f'Supabase public.products row count: {len(initial_products)}')
    assert len(initial_products) == 0, f'Expected 0 products in Supabase, got {len(initial_products)}'
    
    featured = fetch_featured_products()
    print(f'Supabase featured products count: {len(featured)}')
    assert len(featured) == 0, f'Expected 0 featured products in Supabase, got {len(featured)}'

    with open('assets/js/products-data.js', 'r', encoding='utf-8') as fp:
        pd_code = fp.read()
    assert 'var PRODUCTS = [];' in pd_code
    print('PASS: Initial store state is completely empty (0 rows in DB, empty PRODUCTS array in frontend).')

    print('\n====================================================')
    print('TEST 3: ADMIN PRODUCT CREATION FLOW')
    print('====================================================')
    test_prod = {
        'name': 'Essential Immuno-Plus 400g',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'price_inr': 1850,
        'short_description': 'High-dose immune nutrition designed for recovery and critical care.',
        'tags': 'Immune Support, Recovery',
        'benefits': 'Enriched with L-Arginine, Omega-3, and Nucleotides.',
        'ingredients': 'L-Arginine, EPA, DHA, Nucleotides, Glutamine, Vitamins A, C, D, E',
        'how_to_use': 'Mix 2 scoops (50g) in 200ml water twice daily.',
        'in_stock': True,
        'is_featured': True,
        'images': '["https://res.cloudinary.com/dfiskvjbl/image/upload/sample.jpg"]'
    }
    inserted = insert_product(test_prod)
    new_id = inserted[0]['id']
    print(f'Inserted product via admin flow (ID: {new_id}, Name: {inserted[0]["name"]})')

    products_now = fetch_products()
    print(f'Supabase products table count after insert: {len(products_now)}')
    assert len(products_now) == 1
    assert products_now[0]['id'] == new_id
    assert products_now[0]['name'] == 'Essential Immuno-Plus 400g'

    featured_now = fetch_featured_products()
    print(f'Supabase featured products count: {len(featured_now)}')
    assert len(featured_now) == 1
    print('PASS: Product created in admin flow immediately surfaces in customer queries.')

    print('\n====================================================')
    print('TEST 4: ADMIN PRODUCT DELETION FLOW')
    print('====================================================')
    deleted = delete_product(new_id)
    print(f'Deleted product ID {new_id}')

    products_after_del = fetch_products()
    print(f'Supabase products table count after delete: {len(products_after_del)}')
    assert len(products_after_del) == 0
    print('PASS: Product successfully deleted. Database and store return to clean empty state.')

    print('\n====================================================')
    print('TEST 5: ASSET & PATH CHECK')
    print('====================================================')
    with open('productss.html', 'r', encoding='utf-8') as fp:
        shop_html = fp.read()
    assert 'Products coming soon' in shop_html
    assert 'New formulations are being prepared. Please check back soon.' in shop_html
    print('PASS: productss.html empty state is properly configured.')

    with open('index.html', 'r', encoding='utf-8') as fp:
        home_html = fp.read()
    assert 'New formulations coming soon. Please check back later.' in home_html
    print('PASS: index.html empty state is properly configured.')

    print('\n====================================================')
    print('ALL VERIFICATIONS PASSED 100% SUCCESSFULLY!')
    print('====================================================')

if __name__ == '__main__':
    run_tests()
