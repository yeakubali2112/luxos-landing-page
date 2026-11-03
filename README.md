# AURA Studio — Premium Bag Landing Page (Concept V3)

A third, distinctly editorial luxury handbag landing-page concept with an offline-ready `index.html`, three handmade vector bag illustrations, demo product video and simple order-flow logic. All brand information, images, prices and delivery fees are **examples** and not actual product claims.

## Preview

Open `index.html` in Chrome, Firefox or another modern browser. Everything needed is included in the `assets/` folder; there are no third-party font, image or script dependencies.

## Before launching Facebook Ads

1. Replace **AURA / The Aster** with your actual brand and product names.
2. Replace all three SVG demo product illustrations and the `assets/product-demo.mp4` (and its `video-poster.jpg`) with real product photos and video. Update the image names/paths in `index.html` accordingly. Video must be a format supported by browsers, such as MP4 with H.264.
3. Update the `CONFIG` block near the end of `index.html`: `price`, `deliveryInsideDhaka`, `deliveryOutsideDhaka`, `productName` and `whatsappNumber`.
4. For WhatsApp orders, set the business number like `8801XXXXXXXXX` with the real digits. **Until you do, the order form is deliberately demo-only**: on submit it previews an order and offers a copy action, but does not send or save any data.
5. Verify real delivery policies, availability, stock, return conditions and payment/COD arrangements; remove placeholder/demo language only after replacing it with accurate information.
6. For Meta/Facebook campaigns, host over HTTPS, configure a real domain and privacy notice, and add Meta Pixel / Conversions API with consent and proper purchase/lead event handling. No conversion event is emitted in this demo, and submitting does not mean a sale has occurred.
7. Test the full checkout/message journey on Android and iPhone before publishing ads.

## Features

- Responsive mobile-first hero, product showcase, three shade selectors and sample product video.
- Product video and order form side by side on desktop; stacked on mobile.
- Quantity controls (1–20), delivery area selector, and automatic price calculation.
- Bangladeshi mobile number validation, name and address fields.
- Demo order preview when no WhatsApp number is configured; opens WhatsApp with an unsent prefilled message when properly configured.
- Sticky bottom order CTA on mobile, FAQ and accessible labels.

## Files

- `index.html` — standalone page, styles and front-end script
- `assets/bag-rosewood.svg`, `assets/bag-cocoa.svg`, `assets/bag-ivory.svg` — original **illustrated demo** product art
- `assets/product-demo.mp4` — original 6-second illustration-based video sample
- `assets/video-poster.jpg` — video thumbnail

This is a landing page **template, not an integrated e-commerce backend**. It currently collects no database records and takes no payments.
