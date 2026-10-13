# Optional persistent operation

These templates do not install or modify an OS service, task, cloud resource or Codex automation. Use an existing machine, complete local setup first, and leave sending disabled. The application's durable scheduler runs while its Node process is alive.

On Windows, the provided PowerShell launcher starts the console with prospect and owner sending held. It does not create a scheduled task or Windows service. On Linux, review the sample systemd unit, adjust paths/user/Node location, protect the private environment/keys, and install it only under an authorized local administrator action. Runtime is the only writable application directory in the sample service.

Check that the host remains awake, the console binds only to loopback, restart recovery works, and a consistent backup can be restored into a separate held database. The sample service never activates sending. If deploying on a machine with existing accounts or services, use a separate path, user and database and preserve all existing configuration.

Public reverse proxies, multi-user/tenant hosting, distributed workers and paid infrastructure are outside these templates. Add appropriate authentication and shared transactional storage before expanding the local deployment boundary.
