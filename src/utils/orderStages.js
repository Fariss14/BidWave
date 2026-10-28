export const purchaseTabs = [['all','All'],['pay','To pay'],['review','Payment review'],['receive','To receive'],['shipped','Shipped'],['returns','Returns'],['refunds','Refunds'],['cancelled','Cancelled'],['history','History']];
export const salesTabs = [['all','All'],['review','Payment review'],['receive','To ship'],['shipped','Shipped'],['cancellations','Cancellations'],['returns','Returns'],['refunds','Refunds'],['history','History']];
export function matchesOrder(o, tab) {
  const cancelled = o.cancellation?.status === 'approved';
  const active = !cancelled && !o.refund && !o.return;
  return tab === 'all' || (tab === 'pay' && active && (!o.payment || o.payment.status === 'rejected')) || (tab === 'review' && o.payment?.status === 'pending_verification') || (tab === 'receive' && active && o.payment?.status === 'confirmed' && !o.fulfillment) || (tab === 'shipped' && active && o.fulfillment?.status === 'shipped') || (tab === 'returns' && !!o.return) || (tab === 'refunds' && !!o.refund) || (tab === 'cancelled' && cancelled) || (tab === 'cancellations' && !!o.cancellation) || (tab === 'history' && (o.fulfillment?.status === 'completed' || o.refund?.status === 'completed' || cancelled));
}
