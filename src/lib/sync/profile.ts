/**
 * The Order Time customer details shown on the admin account page.
 * Field names follow https://help.ordertime.com/help/customer; anything missing is simply left out.
 * Card details on the customer record (CreditCardNo, ExpMonth ...) are never read.
 */

export interface ProfileAddress { lines: string[]; contact: string | null; phone: string | null; email: string | null }

export interface AccountProfile {
  contact: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  website: string | null;
  accountNumber: string | null;
  customerType: string | null;
  terms: string | null;
  paymentMethod: string | null;
  shipMethod: string | null;
  shippingInstructions: string | null;
  creditLimit: number | null;
  onCreditHold: boolean;
  taxRegistration: string | null;
  salesTaxCertificate: string | null;
  salesTaxCode: string | null;
  note: string | null;
  shipTo: ProfileAddress | null;
  billTo: ProfileAddress | null;
  customFields: { label: string; value: string }[];
}

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const pick = (o: Obj | null | undefined, ...keys: string[]) => {
  if (!o) return null;
  for (const k of keys) { const v = str(o[k]); if (v) return v; }
  return null;
};
const ref = (v: unknown) => (v && typeof v === 'object' ? str((v as Obj).Name) : null);

function person(p: unknown): { name: string | null; phone: string | null; alt: string | null; email: string | null } {
  if (!p || typeof p !== 'object') return { name: null, phone: null, alt: null, email: null };
  const o = p as Obj;
  const name = pick(o, 'Name', 'FullName') ?? ([pick(o, 'FirstName'), pick(o, 'LastName')].filter(Boolean).join(' ') || null);
  return {
    name,
    phone: pick(o, 'Phone', 'Phone1', 'WorkPhone', 'Mobile', 'MobilePhone', 'CellPhone'),
    alt: pick(o, 'AltPhone', 'Phone2', 'Mobile', 'MobilePhone'),
    email: pick(o, 'Email', 'EmailAddress'),
  };
}

function address(a: unknown): ProfileAddress | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Obj;
  const street = ['Addr1', 'Addr2', 'Addr3', 'Addr4'].map(k => pick(o, k)).filter((x): x is string => !!x);
  const cityLine = [pick(o, 'City'), [pick(o, 'State'), pick(o, 'Zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const lines = [...street, ...(cityLine ? [cityLine] : []), ...(pick(o, 'Country') && !/^(us|usa|united states)$/i.test(pick(o, 'Country')!) ? [pick(o, 'Country')!] : [])];
  const contact = pick(o, 'Contact');
  const phone = pick(o, 'Phone');
  const email = pick(o, 'Email');
  return lines.length || contact || phone || email ? { lines, contact, phone, email } : null;
}

const HIDDEN_FIELDS = /card|ssn|password|secret|routing|account\s*#?\s*number|bank/i;

export function customerProfile(c: Obj): AccountProfile {
  const pc = person(c.PrimaryContact);
  const ship = address(c.PrimaryShipAddress);
  const bill = address(c.BillAddress);
  const creditLimit = typeof c.CreditLimit === 'number' && c.CreditLimit > 0 ? c.CreditLimit : null;
  const customFields = Array.isArray(c.CustomFields)
    ? (c.CustomFields as Obj[])
        .map(f => ({ label: str(f.Caption) ?? str(f.Name) ?? '', value: str(f.Value) ?? '' }))
        .filter(f => f.label && f.value && !HIDDEN_FIELDS.test(f.label))
    : [];
  return {
    contact: pc.name ?? bill?.contact ?? ship?.contact ?? null,
    phone: pc.phone ?? pick(c, 'Phone') ?? bill?.phone ?? ship?.phone ?? null,
    altPhone: pc.alt ?? pick(c, 'AltPhone') ?? null,
    email: pc.email ?? pick(c, 'Email') ?? bill?.email ?? ship?.email ?? null,
    website: pick(c, 'Website'),
    accountNumber: pick(c, 'AccountNumber'),
    customerType: ref(c.TypeRef),
    terms: ref(c.TermRef),
    paymentMethod: ref(c.PaymentMethodRef),
    shipMethod: ref(c.ShipMethodRef),
    shippingInstructions: pick(c, 'ShippingInstructions'),
    creditLimit,
    onCreditHold: c.OnCreditHold === true,
    taxRegistration: pick(c, 'TaxRegistrationNumber'),
    salesTaxCertificate: pick(c, 'SalesTaxCertificate'),
    salesTaxCode: ref(c.SalesTaxCodeRef),
    note: pick(c, 'Note'),
    shipTo: ship,
    billTo: bill,
    customFields,
  };
}
