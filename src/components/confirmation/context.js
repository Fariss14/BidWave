import { createContext, useContext } from 'react';
export const ConfirmationContext = createContext(null);
export function useConfirm() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error('ConfirmationProvider is required');
  return confirm;
}
