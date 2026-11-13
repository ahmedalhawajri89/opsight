import { api } from '@/lib/apiClient';

/**
 * The morning brief (product track, phase C): the reader's settings, a
 * preview of what today's brief says, and a test send.
 */
export function getBrief() {
  return api.get('/me/brief');
}

export function sendTestBrief() {
  return api.post('/me/brief/test');
}

/** Saved through the same route as the language: a personal preference. */
export function updateBriefSettings({ morning_brief, brief_channel, whatsapp_phone }) {
  return api.patch('/me/preferences', { morning_brief, brief_channel, whatsapp_phone });
}

/** A six-digit code to the saved WhatsApp number, to prove it is the reader's. */
export function sendWhatsAppCode() {
  return api.post('/me/whatsapp/code');
}

/** The code typed back. */
export function verifyWhatsAppCode(code) {
  return api.post('/me/whatsapp/verify', { code });
}
