import { useState } from 'react';
import { useDemo } from '../state/context';
import { useConfirm } from '../components/confirmation/context';
import { api } from '../state/api';
export default function AccountSettings() {
  const confirm = useConfirm();
  const { profile, updateAccount } = useDemo();
  const [name, setName] = useState(profile.name);
  const [feedback, setFeedback] = useState(null);
  const [passwordFeedback, setPasswordFeedback] = useState(null);
  const [pending, setPending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  async function save(event) {
    event.preventDefault(); if (!await confirm({ title: 'Save your account details?', details: <p>Display name: {name}</p>, confirmLabel: 'Save changes' })) return; setPending(true); setFeedback(null);
    try { await updateAccount(name); setFeedback({ text: 'Your account details have been updated.' }); }
    catch (error) { setFeedback({ error: true, text: error.message }); }
    finally { setPending(false); }
  }
  async function changePassword(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    setPasswordFeedback(null);
    if (values.password !== values.confirmPassword) return setPasswordFeedback({ error: true, text: 'Your new passwords do not match.' });
    if (!await confirm({ title: 'Change your password?', description: 'Other signed-in sessions will be signed out.', confirmLabel: 'Change password' })) return;
    setPasswordPending(true);
    try { await api('/account/password', { method: 'POST', body: values }); form.reset(); setPasswordFeedback({ text: 'Password updated. Other sessions have been signed out.' }); }
    catch (error) { setPasswordFeedback({ error: true, text: error.message }); }
    finally { setPasswordPending(false); }
  }
  return <><div className="dashboard-heading"><span className="eyebrow">Make yourself at home</span><h1>Account settings</h1><p className="muted">Manage the details that make your account yours.</p></div><form className="dashboard-panel" onSubmit={save}><h2>Personal details</h2><label htmlFor="settings-name">Display name</label><input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength="40" autoComplete="name" /><label htmlFor="settings-email">Email address</label><input id="settings-email" value={profile.email} type="email" readOnly /><p className="field-hint">Email verification is disabled for this test marketplace. Addresses are not verified.</p>{feedback && <p className={feedback.error ? 'form-error' : 'form-success'} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}<button className="button form-submit" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button></form><form className="dashboard-panel" onSubmit={changePassword}><h2>Change password</h2><label htmlFor="current-password">Current password</label><input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength="128" /><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" required minLength="10" maxLength="128" /><label htmlFor="new-password-confirm">Confirm new password</label><input id="new-password-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength="10" maxLength="128" />{passwordFeedback && <p className={passwordFeedback.error ? 'form-error' : 'form-success'} role={passwordFeedback.error ? 'alert' : 'status'}>{passwordFeedback.text}</p>}<button className="button form-submit" type="submit" disabled={passwordPending}>{passwordPending ? 'Updating…' : 'Update password'}</button></form></>;
}
