import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmationContext } from './context';
export default function ConfirmationProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);
  const dialog = useRef(null);
  const previousFocus = useRef(null);
  const confirm = useCallback((options) => new Promise((resolve) => {
    resolver.current?.(false);
    previousFocus.current = document.activeElement;
    resolver.current = resolve;
    setRequest(options);
  }), []);
  function finish(result) {
    const resolve = resolver.current;
    resolver.current = null;
    dialog.current?.close();
    setRequest(null);
    previousFocus.current?.focus();
    resolve?.(result);
  }
  useEffect(() => {
    if (request && !dialog.current.open) dialog.current.showModal();
  }, [request]);
  useEffect(() => () => resolver.current?.(false), []);
  return <ConfirmationContext.Provider value={confirm}>{children}{request && <dialog ref={dialog} className="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-description" onCancel={(event) => { event.preventDefault(); finish(false); }} onClose={() => { if (resolver.current) finish(false); }}><span className="eyebrow">Please review</span><h2 id="confirm-title">{request.title || 'Save these changes?'}</h2><p id="confirm-description">{request.description || 'Review your changes before continuing.'}</p>{request.details && <div className="confirm-details">{request.details}</div>}<div className="confirm-actions"><button type="button" className="button button-outline" autoFocus onClick={() => finish(false)}>Cancel</button><button type="button" className="button" onClick={() => finish(true)}>{request.confirmLabel || 'Confirm'}</button></div></dialog>}</ConfirmationContext.Provider>;
}
