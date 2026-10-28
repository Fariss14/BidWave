import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DemoContext } from '../src/state/context';
import ConfirmationProvider from '../src/components/confirmation/ConfirmationProvider';
import { categories } from '../src/utils/auction';
import { createSeed } from '../src/data/seed';
import Home from '../src/pages/Home';
import SellItem from '../src/pages/SellItem';
import { ListingEditor } from '../src/pages/EditListing';
import AuctionDetail from '../src/pages/AuctionDetail';
import SellerSettings from '../src/pages/SellerSettings';
import Notifications from '../src/pages/Notifications';
import Auctions from '../src/pages/Auctions';
import Profile from '../src/pages/Profile';
import Dashboard, { DashboardOverview, DashboardActivity } from '../src/pages/Dashboard';
import Addresses from '../src/pages/Addresses';
import AccountSettings from '../src/pages/AccountSettings';
import { PaymentOrder } from '../src/pages/Payments';
import RequireAccount from '../src/components/RequireAccount';
import Navbar from '../src/components/Navbar';

const user = { id: 'render-user', name: 'Test account', email: 'fake@gmail.com' };
const state = { ...createSeed(), categories: categories.map(id => ({id,name:id})), authReady: true, profile: user, warning: '', signOut() {}, updateAccount() {} };
function render(component, { profile = user, route = '/dashboard', ...overrides } = {}) {
  return renderToStaticMarkup(<ConfirmationProvider><MemoryRouter initialEntries={[route]}><DemoContext.Provider value={{ ...state, profile, ...overrides }}>{component}</DemoContext.Provider></MemoryRouter></ConfirmationProvider>);
}
test('home, browse and account shell render for guests and signed-in accounts', () => {
  assert.match(render(<Home />), /Catch your next wave/);
  const browse = render(<Auctions />, { route: '/auctions?category=electronics' });
  assert.match(browse, /Studio Wireless Headphones/);
  assert.doesNotMatch(browse, /Limited Sneakers/);
  assert.match(render(<Navbar />), /My dashboard/);
  assert.match(render(<Navbar />, { profile: null }), /Sign up/);
  assert.match(render(<Dashboard />), /account-sidebar/);
  assert.match(render(<DashboardOverview />), /Hello, Test account/);
  assert.match(render(<DashboardOverview />, { profile: null }), /guest/);
  assert.match(render(<DashboardActivity />), /My bids/);
});
test('real account forms and address autofill controls render with required labels', () => {
  const signup = render(<Profile signup />, { profile: null, route: '/signup' });
  assert.match(signup, /type="email"/); assert.match(signup, /Confirm password/); assert.match(signup, /Email verification is off/);
  assert.match(render(<AccountSettings />), /Current password/);
  const addresses = render(<Addresses />);
  assert.match(addresses, /shipping street-address/); assert.match(addresses, /shipping-region/); assert.match(addresses, /Choose barangay/);
  assert.match(render(<RequireAccount><Addresses /></RequireAccount>, { profile: null }), /Sign in to save account/);
});
test('all payment methods and pending submission downloads render without claiming paid status', () => {
  const methods = ['GCash', 'Maya', 'MariBank', 'Bank account'].map((name, i) => ({ id: ['gcash', 'maya', 'maribank', 'bank'][i], name }));
  const order = { id: 'sample-order', title: 'Sample order', amount: 2500, demo: true };
  const form = render(<PaymentOrder order={order} methods={methods} address={null} onSubmitted={() => {}} />);
  for (const method of methods) assert.ok(form.includes(method.name));
  assert.match(form, /type="file"/); assert.match(form, /No payment required/i); assert.match(form, /Do not transfer money/);
  const receipt = render(<PaymentOrder order={{ ...order, payment: { id: 'submission-1', method: 'GCash', reference: 'TEST', submittedAt: Date.now() } }} methods={methods} address={null} onSubmitted={() => {}} />);
  assert.match(receipt, /Pending verification/); assert.match(receipt, /Download submission receipt/); assert.match(receipt, /does not mark the order paid/);
});

test('publishing waits for the saved draft before displaying editable fields', () => {
  const html = render(<SellItem />);
  assert.match(html, /Loading your draft/);
  assert.doesNotMatch(html, /id="item-title"/);
});
test('seller settings and the notification inbox render the new account sections', () => {
  const settings = render(<SellerSettings />);
  assert.match(settings, /Contact phone/); assert.match(settings, /Receiving accounts \/ QR codes/);
  for (const name of ['GCash', 'Maya', 'MariBank', 'Bank account']) assert.ok(settings.includes(name));
  const inbox = render(<Notifications />, { demoMode: false, notifications: [{ id: 'n1', title: 'You won an auction!', body: 'A test item', href: '/dashboard/payments', type: 'auction_won', createdAt: Date.now(), readAt: null }] });
  assert.match(inbox, /You won an auction!/); assert.match(inbox, /winning order/); assert.match(inbox, /Mark read/);
  const guest = render(<Notifications />, { profile: null, demoMode: true, notifications: [] });
  assert.match(guest, /local guest-demo results/);
});
test('real checkout uses private order QR URLs and seller-provided contacts', () => {
  const order = { id: 'private-order', title: 'A real listing', amount: 100, demo: false, settlement: { contactName: 'Seller Name', phone: '09170000000', link: 'https://example.com/seller', methods: [{ id: 'maya', name: 'Maya', accountName: 'Seller Account', accountNumber: '', qrId: 'private-qr' }] } };
  const html = render(<PaymentOrder order={order} methods={[]} address={{ recipient: 'Buyer', street: 'Example Street', city: 'Quezon City', barangay: 'Alicia', postalCode: '1105' }} onSubmitted={() => {}} />);
  assert.match(html, /Contact your seller/); assert.match(html, /09170000000/);
  assert.match(html, /\/api\/account\/orders\/private-order\/qr\/maya/);
  assert.doesNotMatch(html, /\/api\/media\/private-qr/);
  assert.match(html, /not identity verified/);
});
test('auction details show minimum bid, increment and item location', () => {
  const html = render(<Routes><Route path="/auctions/:id" element={<AuctionDetail />} /></Routes>, { route: '/auctions/studio-headphones', demoMode: false });
  assert.match(html, /Minimum bid:/); assert.match(html, /Increment:/); assert.match(html, /min="2501"/); assert.match(html, /National Capital Region/);
});

test('listing editors show populated fields before bids and locked pricing after bids', () => {
  const a = { ...state.auctions[0], seller: user, bids: [], revision: 0, increment: 100 };
  const editable = render(<ListingEditor initial={a} hasBids={false} onReload={() => {}} />);
  for (const id of ['edit-title', 'edit-description', 'edit-category', 'edit-price', 'edit-increment', 'edit-photo', 'edit-deadline']) assert.ok(editable.includes(`id="${id}"`));
  assert.match(editable, /Review and save changes/); assert.match(editable, /Studio Wireless Headphones/);
  const restricted = render(<ListingEditor initial={{ ...a, bids: [{ id: 'bid', amount: 2500 }] }} hasBids onReload={() => {}} />);
  assert.match(restricted, /extend the end date/); assert.match(restricted, /id="edit-deadline"/);
  assert.match(restricted, /id="edit-title"/); assert.match(restricted, /id="edit-photo"/); assert.match(restricted, /id="edit-price"[^>]*disabled/);
});
test('owners get active-listing edit links and authentication preserves deep editor destinations', () => {
  const owned = { ...state.auctions[0], seller: user, bids: [], endsAt: Date.now() + 3600000 };
  const html = render(<DashboardActivity listings />, { auctions: [owned] });
  assert.match(html, /Edit listing \/ end date/); assert.ok(html.includes(`/dashboard/listings/${owned.id}/edit`));
  const ended = render(<DashboardActivity listings />, { auctions: [{ ...owned, endsAt: Date.now() - 1000 }] });
  assert.doesNotMatch(ended, /Edit listing \/ end date/);
  const login = render(<Profile />, { profile: null, route: '/login?returnTo=%2Fdashboard%2Flistings%2Fowned%2Fedit' });
  assert.ok(login.includes('returnTo=%2Fdashboard%2Flistings%2Fowned%2Fedit'));
});

test('winning bidders can proceed to payment from their bids', () => {
  const won = { ...state.auctions[0], endsAt: Date.now() - 1000, bids: [{ id: 'winning', bidderId: user.id, amount: 2500, at: Date.now() - 2000 }] };
  const html = render(<DashboardActivity />, { auctions: [won] });
  assert.match(html, /Proceed to payment/);
  const lost = render(<DashboardActivity />, { auctions: [{ ...won, bids: [{ ...won.bids[0], bidderId: 'other' }, ...won.bids] }] });
  assert.doesNotMatch(lost, /Proceed to payment/);
});
