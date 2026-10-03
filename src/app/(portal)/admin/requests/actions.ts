'use server';

import { revalidatePath } from 'next/cache';
import { approveRequest, createLeadFor, declineRequest } from '@/lib/access-requests';
import { requireUser } from '@/lib/session';

export interface ReviewResult { ok: boolean; message: string; warning?: string }

function refresh(id: number) {
  revalidatePath('/admin/requests');
  revalidatePath(`/admin/requests/${id}`);
}

export async function approve(_: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  const me = await requireUser(['ADMIN']);
  const id = Number(form.get('requestId'));
  const mode = form.get('mode');
  const res = await approveRequest({
    requestId: id, actor: me.email,
    existingAccountId: mode === 'existing' ? Number(form.get('accountId')) || null : null,
    repId: Number(form.get('repId')) || null,
    priceLevelId: Number(form.get('priceLevelId')) || null,
  });
  refresh(id);
  return res;
}

export async function decline(_: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  const me = await requireUser(['ADMIN']);
  const id = Number(form.get('requestId'));
  const res = await declineRequest(id, me.email, String(form.get('reason') ?? '').trim().slice(0, 500), form.get('notify') === 'on');
  refresh(id);
  return res;
}

export async function retryLead(_: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  await requireUser(['ADMIN']);
  const id = Number(form.get('requestId'));
  const r = await createLeadFor(id);
  refresh(id);
  return r?.leadId ? { ok: true, message: `Lead ${r.leadId} created in Order Time.` } : { ok: false, message: `Still not created: ${r?.leadError ?? 'unknown error'}` };
}
