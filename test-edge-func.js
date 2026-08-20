fetch('https://ilduyhuvpiqhvbnocqxf.supabase.co/functions/v1/createRazorpayOrder', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId: 123, amount: 100 })
}).then(async r => {
  console.log("Status:", r.status);
  console.log("Response:", await r.text());
}).catch(console.error);
