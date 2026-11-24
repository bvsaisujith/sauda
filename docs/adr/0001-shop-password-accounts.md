# ADR 0001: Shop-name and password accounts

Status: Accepted | Date: 2026-11-24 | Owner: Sai Sujith

## Context

Sauda shipped owner access as a single-shop, single-owner model unlocked by a 4 to 8 digit
PIN. That fit a one-phone prototype, but the product is sold to shops, and a shop needs to
reach its own data from a new phone, a replacement phone, or a second counter device.

The PIN model blocks all three:

- There is no way to identify *which* shop is signing in, so a second shop cannot be added
  without a schema and data-model change later.
- A 4 to 8 digit PIN has too little entropy for a network-reachable endpoint. It is protected
  only by an in-memory throttle, which a restart clears.
- A PIN cannot be chosen or remembered the way a password can, and it cannot be typed on a
  different device without someone reading it out.

The demo gate needs items, prices and stock, and the V1 gate adds parties, bills, GST and
credit. Every one of those is shop-scoped. Deciding the account model now avoids migrating
all of them later.

## Decision

Shops register with a **shop name and an alphanumeric password**.

- `Shop.loginKey` is a unique, trimmed, lowercased copy of the shop name. It is the login
  identifier; `Shop.name` stays as typed and is what the owner sees.
- `Owner.passwordHash` stores `scrypt$N$r$p$salt$hash`, with a per-shop 16-byte random salt.
  The plain password is never stored, logged or returned.
- `POST /auth/signup` creates the shop and owner in one transaction and returns a device
  token. `POST /auth/signin` exchanges credentials for a device token.
- Device tokens, expiry, revocation and the auth throttle are unchanged in shape; the
  throttle is now keyed per shop rather than per device.
- Wrong shop name and wrong password return one message, `Shop name or password is
  incorrect`, so the form does not disclose which shops exist.

### Alternatives considered

- **Keep the PIN, add a shop picker.** Rejected: still needs a way to prove the picker choice,
  and a 4-digit secret over HTTPS is not defensible.
- **Email or phone OTP.** Rejected for the demo gate: needs a verified delivery channel,
  an SMS or mail provider, and a fallback when the network is down in a shop.
- **Passwordless device pairing by QR code.** Rejected: convenient for a second phone, but it
  makes the first device the only root of trust and complicates recovery.
- **Multi-tenant by shop id in the URL.** Rejected: the shop must come from the credential, not
  from a path the client can change.

## Consequences

Positive:

- Shops are isolated by construction; every shop-scoped query filters on the token's shop id.
- Passwords are stored with a memory-hard hash and a per-shop salt, so a database leak does not
  hand over reusable plaintext.
- Login works on any device without a shared secret being read aloud.
- The account model is settled before items, stock, bills and parties are built on top of it.

Costs:

- The `Shop.loginKey` column and the `Owner.pinHash` to `Owner.passwordHash` rename ship as
  migration `0003_shop_password_accounts`. Existing single-shop data keeps working: `loginKey`
  is backfilled from the lowercased shop name.
- Shop names become globally unique, so two owners cannot both trade as "Ambika Kirana"
  without a distinguishing suffix. The duplicate is refused at sign-up with a clear message.
- Sign-in is slower than a PIN check by design; scrypt at `N=2^15` costs roughly a tenth of a
  second per attempt.
- The throttle is process-local, so it resets on deploy. That only ever favours the owner, but
  it means a determined attacker gets a fresh set of attempts after each restart.
- The lockout is per shop, so a phone that exhausts its attempts also locks the shop for the
  counter device. The alternative, per-device lockout, is weaker and is recorded as an open
  item in the SRS.

## Follow-ups

- Password reset needs a verified contact channel and is out of the demo gate (SRS §10).
- Whether an owner may rename a shop after registration is still open; the login key makes the
  change mechanical when it is decided.
- Android secure storage for the device token lands with the Capacitor shell.