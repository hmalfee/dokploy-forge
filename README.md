# Dokploy Templates

Dokploy templates for manual but faster setup.

This project provides templates that are added manually, since Dokploy currently does not offer importing templates.

## Volume path rule

For **any** template in this repo:

- Every file or folder under `mounts/` should be added in Dokploy at:
  - **Advanced -> Volumes**
- Mapping format:
  - `mounts/<relative-path>` -> `/<relative-path>`

### Example

- `mounts/config/config.yaml` -> `/config/config.yaml`

If you add more files under `mounts/`, use the same conversion rule for each one.

## Domain

When adding a domain to a service in Dokploy, always use the same service port exposed under `ports` in that service's `docker-compose.yml`.

- If the domain uses a different port than the one exposed by the service, the service will not be reachable from that domain.

## Environment variables

For services that provide an example env file (for example `gatus/.env.example`), copy the variables and paste them in the Dokploy service **Environment** tab.
