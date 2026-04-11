<!-- this file's content is directly copied from this section: https://github.com/Dokploy/templates/blob/canary/CONTRIBUTING.md#templatetoml-structure -->

# Template.toml Structure

- **[variables]**: Define reusable values or use helpers.
  Example:

  ```toml
  [variables]
  main_domain = "${domain}"
  my_password = "${password:32}"
  ```

- **[config.domains]**: Map services to domains/ports.
  - Required: `serviceName`, `port`, `host`.
  - Optional: `path`.

- **[config.env]**: Array of environment variables (strings).
  Example: `env = ["GF_SECURITY_ADMIN_PASSWORD=${password:32}"]`

- **[config.mounts]**: Inline files or configs.
  - `filePath`: Destination in container.
  - `content`: Multi-line string.

## Helpers

Use these in `${}` for dynamic values:

- `${domain}`: Random subdomain.
- `${password:length}`: Random password (default 32 chars).
- `${base64:length}`: Base64-encoded random string.
- `${hash:length}`: Random hash.
- `${uuid}`: UUID.
- `${randomPort}`: Random port.
- `${email}`: Random email.
- `${username}`: Random lowercase username.
- `${timestamp}`: Current timestamp (ms).
- `${timestamps:datetime}` or `${timestampms:datetime}`: Timestamp at specific date (e.g., `${timestamps:2030-01-01T00:00:00Z}`).
- `${jwt:secret_var:payload_var}`: JWT token (advanced; see README for details).
