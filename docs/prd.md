# VoiceStack — product brief

Written 20 November 2026, from a conversation with the builder. This is the source the
floorplan blueprint was drawn from.

## The problem

A wholesaler or retailer in India runs the business from a counter: bills to write, stock to
keep straight, and a khata book of what each customer still owes. Most software for this is
built for a back office, in English, on a laptop — while the shopkeeper works on a phone, in
their own language, with a customer waiting.

## Who uses it

- **The shop owner** (wholesaler or retailer): sets prices and credit limits, watches dues,
  files GST, adds staff.
- **Counter staff**: makes bills, takes payments, checks stock — on a shared phone or their
  own.
- Customers don't have an account in v1. They get a bill, a payment link and a reminder.

## What v1 does

1. **Billing** — line items by search or barcode, GST at the right rate, discount, round off,
   print/share a GST-format PDF, cancel with a credit note.
2. **Stock** — products with unit, GST rate, purchase and selling price; stock in from a
   supplier bill; stock out on every bill; adjustments with a reason; low-stock flags.
3. **Khata (credit)** — every customer has a running ledger. An unpaid bill sits on it until
   a payment knocks it off, oldest bill first. Credit limit per customer, ageing buckets
   (0–15, 16–30, 31–60, 60+ days), reminders on WhatsApp with SMS as fallback.
4. **Payments** — cash, UPI, card recorded against a bill or a customer's balance; a wrong
   entry can be reversed. Optional Razorpay UPI link/QR for the customer to pay from their
   phone.
5. **Voice** — press and talk in any of 22 Indian languages ("do sau packet add karo"), see
   what was heard, confirm, and the bill or payment is made. The assistant speaks the
   confirmation back.
6. **Offline** — a bill made with no signal is kept on the phone and sent in order when the
   connection returns.
7. **Reports** — sales, GST collected by rate, stock value and dead stock, for a chosen
   period.

## Screens

Today · Sign in · New shop setup · Billing · Bills · One bill · Customers · Customer khata ·
Dues & reminders · Stock · Stock intake · Reports · Voice assistant · Settings.

## Rules that matter

- Bills are tax invoices under Indian GST: CGST+SGST within the state, IGST across states,
  HSN on lines, prices entered tax-inclusive, rounding to the nearest rupee per bill, bill
  numbers sequential per financial year.
- Stock value is kept at average purchase cost; a bill lowers stock, a cancellation puts it
  back.
- Nothing about a customer's balance is ever hard-deleted: reversals and cancellations leave
  an audit trail.
- A voice action never changes data until the shopkeeper has seen and confirmed it.

## Not in v1

- Separate native Android/iOS apps (the web app installs to the home screen).
- Holding customer money (escrow/wallet). Razorpay links only.
- E-invoice IRN / e-way bill generation.
- Supplier payables ledger (only stock intake).
- Multiple shops or godowns per account.
- On-device voice models.

## Open questions

1. Collect money in-app and reconcile automatically, or only record payments already taken?
2. Which languages on day one, and is mixed Hindi–English speech required?
3. Multi-shop, multi-godown and per-person permissions — needed now or later?
4. GST bill PDF enough, or is e-invoicing (IRN) required?
5. Supplier bills and payables, or stock intake only?
6. Must voice work offline on the phone?
