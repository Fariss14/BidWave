For Render Free + Supabase deployment, follow [the free-hosting guide](docs/FREE-HOSTING.md). PostgreSQL records and private object storage survive server restarts.

# BidWave

A React marketplace backed by Node HTTP and SQLite. Visitors can try local guest bidding; signed-in accounts use shared auctions, seller settlement details, persistent notifications, and private payment proof uploads.

## Run

Requires **Node.js 22.13+**. Node 22 labels its built-in SQLite module experimental.

```sh
npm install
npm run dev
```

Vite includes the API during development. SQLite is initialized automatically at `data/bidwave.sqlite`; no hosted database, map account, or email service is required.

```sh
npm run build
npm start
```

The complete built app runs on port 3000, including SPA routes and API downloads. Copy `.env.example` to `.env` to configure the database path, origin, host, or port. Use `npm start`, rather than Vite's static `npm run preview`, for the built app with its API. Run commands from the project root so the bundled geographic snapshot can be located.

## Accounts and dashboard

Register with a name, email-shaped address, and a 10–128 character password. Email verification is intentionally disabled: made-up Gmail addresses work for testing. No password-reset email flow is provided.

Passwords use salted scrypt hashes. Opaque sessions are stored as hashes and sent through HttpOnly, SameSite cookies. Sessions last seven days; sign-out revokes the current session, and changing the password revokes other sessions.

The responsive dashboard contains overview, bids, listings, shipping address, seller contact/payment settings, payments, account settings, and notifications. Guest activity stays in localStorage under `bidwave-demo-v1`, separate from signed-in activity.

## Addresses and item distance

Address selection uses local **Region → Province/area → City/municipality → Barangay** dropdowns. Dependent choices reset when a parent changes. Province-free cities are supported, and Manila's sub-municipality barangays are grouped under Manila. The server validates membership instead of trusting the names submitted by the browser.

The bundled [PSGC-derived snapshot](server/data/NOTICE.md) has 17 regions, 82 provinces, 1,642 cities/municipalities/special geographic units, and 42,001 named barangays. Its source documents a December 2023 basis, so it predates later administrative changes. **Cannot find your area? Enter manually** is available for missing/renamed areas and legacy address codes. Browser autofill remains enabled for contact, house/unit/street, and postal code. No remote address service is contacted during use.

Sellers must provide an item area when publishing. Public views show its city and province/region, not a street or house address. Sellers can optionally add device location, rounded to roughly a 1 km grid before storage. Bidders can choose **Use my location to estimate distance**; the server returns rounded straight-line distance and does not persist the bidder's coordinates. The calculation requires the seller to have added a device location. Permission denial or unavailable geolocation leaves area labels usable. Browser geolocation generally needs localhost or HTTPS.

## Publishing and increments

Before publishing, open **Dashboard → Seller contact & payments**:

- Add contact name, phone, and an optional HTTP(S) messaging/profile link.
- Enable GCash, Maya, MariBank, or Bank account. Each enabled method requires an account holder name and an account number or uploaded QR image. Bank accounts also require a bank name.
- QR images accept PNG, JPEG, or WebP up to 5 MB each.

The listing form supports a product file upload with preview (PNG/JPEG/WebP, up to 5 MB), or an image URL for compatibility. Product images are public; QR images are private.

Choose an existing category or **Custom** to add one when publishing. Category names are deduplicated case-insensitively after normalization. Set a 1-, 3-, or 7-day duration, or **Custom** for a local date/time between 5 minutes and 30 days ahead. The server is authoritative about deadlines.

New auctions default to a **₱100 minimum increment**. Sellers can change this before publishing. The first bid can meet the starting price; later bids must reach the current price plus the increment. Larger, non-multiple increases are allowed. Existing auctions retain a ₱1 increment to preserve their previous behavior. Guest demo bidding uses the same rule.

Publishing snapshots the seller's settlement details. Later seller-settings changes affect future listings, not published snapshots. Saving seller settings also completes legacy listings/orders that have no seller details and no payment submission. Existing proof and receipt records are retained. Example seed listings are labeled and cannot represent real seller contact information.

## Editing a listing

Open **Dashboard → My listings → Edit listing / end date**, or use the edit link on your own active auction. Before any bids, you can edit title, description, category, starting price, increment, photo, item location, and end date/time. Unchanged photos and location are retained automatically.

After bidding starts, only extending the deadline is allowed; item and pricing terms remain fixed. Each deadline change notifies existing bidders in their notification inbox. New deadlines must be 5 minutes to 30 days ahead. Ended, finalized, or settled auctions cannot be reopened; create a new listing instead.

A review modal shows the previous and new deadlines before saving. Ownership and deadline rules are enforced on the server. If another bid or edit occurs while the editor is open, saving is rejected and **Reload the latest listing** lets the seller review the updated state. Existing bids, settlement details, and order results are preserved.

## Auction results

An idempotent finalizer runs at startup, every 30 seconds while the application server is running, and before account order/notification reads. It creates one winning order and one win/loss notification per participating account, plus a seller outcome notification. Unique database constraints and a transaction prevent duplicates. Auctions that ended while the server was stopped are processed on restart.

The bell and **Dashboard → Notifications** show persistent unread results, with read/unread and mark-all-read actions. Signed-in clients poll every 15 seconds and on window focus. Notifications are in-app only; no email or push service is used. Guests receive local demo results while visiting or when reopening their browser session; these never reveal real seller information.

## Settlement and payment proofs

Only the winning account can access the order's seller contact information and payment accounts/QR images. Public listing and bid responses omit those details and private coordinates. Contact details are seller-provided and are **not identity verified**.

For a won auction, choose one of that seller's snapshotted methods, transfer using your own wallet/bank app, provide the transaction reference, and upload a PNG/JPEG/WebP/PDF proof up to 5 MB. A saved shipping address is filled in and snapshotted with the submission.

Proof stays **Pending verification**. Uploading a file does not mark an order paid or confirm receipt of money. Users can download their original proof and a plain-text submission receipt. There is no automated wallet integration or seller/admin approval interface in this version.

**Try sample order** provides a walkthrough without waiting for an auction to end; no money transfer or shipping address is required for that sample. Legacy site-wide `PAYMENT_*` environment variables are no longer used as receiving destinations. Sellers configure their own details in the dashboard.

## Confirmations

Accessible native dialogs review account creation, publishing, bids, proof submissions, sample-order creation, account/password/address/seller-setting saves, address removal, and sign-out. Cancel or Escape submits nothing; keyboard focus returns to the initiating control. File choices, typing, filters, and notification read markers do not require an extra confirmation.

## Checks

```sh
npm run lint
npm test
npm run build
```

Tests use temporary/in-memory databases and do not require open network ports. They cover authentication and persistence; local address hierarchy; category/duration validation; minimum increments; product/QR uploads; private seller settlement access; one-time auction outcomes and restart catch-up; guest notifications; proof limits; truthful receipts; and frontend server-render smoke checks. Native dialog keyboard interaction, device permission prompts, and responsive visuals still need browser verification when a browser is available.

## Hosting and data

Set `NODE_ENV=production` and `APP_ORIGIN` to the exact HTTPS origin for deployment. Production cookies use `Secure` and the `__Host-` prefix. Use an HTTPS reverse proxy and a private persistent volume for `data/`. Back up the database with its WAL files or SQLite backup tooling. Uploaded images, QR codes, and proofs are stored as SQLite blobs; never expose the database through static hosting.

Schema additions preserve existing accounts, sessions, auctions, addresses, bids, orders, and proofs. New tables hold categories, media, seller defaults, finalization records, and notifications. This implementation targets one application server; rate limits are in memory and reset on restart. Images referenced by URL and optional Google Fonts require internet access; image placeholders and system font fallbacks are available.
