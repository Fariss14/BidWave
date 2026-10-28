import { purchaseTabs, salesTabs, matchesOrder } from '../utils/orderStages';
export default function OrderTabs({ orders, seller, value, onChange }) {
  return <nav className="order-tabs" aria-label="Order stages">{(seller ? salesTabs : purchaseTabs).map(([id,label]) => <button key={id} className={value === id ? 'button button-small' : 'button button-small button-outline'} aria-pressed={value === id} onClick={() => onChange(id)}>{label} ({orders.filter((o) => !o.demo && matchesOrder(o,id)).length})</button>)}</nav>;
}
