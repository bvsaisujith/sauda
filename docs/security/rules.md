# VoiceStack security rules

This project uses ARTEX for authorized security review. No active scanning is permitted against a public or third-party system by default.

Before a dynamic test, record:

- target URL or local service;
- owner and written authorization;
- in-scope hosts, paths and accounts;
- excluded paths and actions;
- test window and rate limit;
- whether destructive actions, payment flows, webhooks or customer data are excluded;
- stop conditions and rollback plan.

For the current repository, there is no application code and therefore no target to scan. The first useful ARTEX run will be a white-box audit after the initial VoiceStack slice is implemented.
