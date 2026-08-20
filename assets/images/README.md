# Azzurra Product Images

Place all product images in this directory.

## Naming Convention
Filenames must match the `image_url` values stored in Supabase `products` table exactly.
The `image_url` field stores the relative path from the site root, e.g.:

```
./assets/images/luminary-serum.jpg
```

## Expected Files (from seed data)
| Filename                  | Product                   |
|---------------------------|---------------------------|
| luminary-serum.jpg        | Luminary Molecular Serum  |
| cellsync-device.jpg       | CellSync Pulse Device     |
| neuro-prime.jpg           | Neuro-Prime Catalyst      |
| genesis-kit.jpg           | The Genesis System        |
| telomere-elixir.jpg       | Telomere Elixir           |
| bio-patch.jpg             | Azzurra Bio-Patch         |
| radiance-kit.jpg          | Radiance Cellular Kit     |
| omegacore.jpg             | OmegaCore Vital           |
| placeholder.jpg           | Fallback for missing imgs |

## Recommended Dimensions
- Aspect ratio: **4:5** (portrait)
- Minimum: 600 × 750 px
- Format: JPEG (optimised, < 200 KB) or WebP

## Offline Fallback
If an image file is missing, `shop.js` adds a CSS gradient placeholder
automatically via the `img onerror` handler — no broken image icons.

## Adding a New Product
1. Add your image to this folder.
2. Use the Admin → Products → Add Product form.
3. In the "Image Path" field enter: `./assets/images/your-image.jpg`
4. Supabase will store this relative path in `products.image_url`.
